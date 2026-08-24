import type { FastifyBaseLogger } from "fastify";

import type { SmsContent } from "./sms.templates.ts";

export interface SmsProviderConfig {
  primaryUrl: string;
  primaryKey?: string | undefined;
  primarySecret?: string | undefined;
  backupUrl?: string | undefined;
  backupSid?: string | undefined;
  backupToken?: string | undefined;
  backupFrom: string;
}

export interface SmsTransportConfig extends SmsProviderConfig {
  /** `console` renders the message to the logger and dispatches nothing. */
  transport: "http" | "console";
  senderId: string;
}

export interface SmsServiceOptions {
  config: SmsTransportConfig;
  logger: FastifyBaseLogger;
}

export type SmsProvider = "primary" | "backup";

export type SmsDeliveryResult =
  | { status: "sent"; provider: SmsProvider }
  | { status: "logged" }
  | { status: "failed"; error: Error };

export interface SmsService {
  /**
   * Dispatches a message, failing over from the primary gateway to the backup.
   * Never throws, for the same fire-and-forget reason as `EmailService.send`.
   */
  send(phoneNo: string, content: SmsContent): Promise<SmsDeliveryResult>;
}

/** Tight enough to detect a primary-gateway outage without stalling a request. */
const PRIMARY_TIMEOUT_MS = 4000;
const BACKUP_TIMEOUT_MS = 5000;

function basicAuth(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

export function createSmsService({
  config,
  logger,
}: SmsServiceOptions): SmsService {
  const log = logger.child({ service: "sms" });

  async function sendViaPrimary(
    phoneNo: string,
    text: string,
  ): Promise<void> {
    const { primaryKey, primarySecret } = config;
    if (!primaryKey || !primarySecret) {
      throw new Error("Primary SMS credentials are not configured");
    }

    const response = await fetch(config.primaryUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: basicAuth(primaryKey, primarySecret),
      },
      body: JSON.stringify({
        from: config.senderId,
        to: phoneNo,
        message_type: "text",
        text,
      }),
      signal: AbortSignal.timeout(PRIMARY_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(
        `Primary SMS provider returned status ${response.status}`,
      );
    }
  }

  async function sendViaBackup(phoneNo: string, text: string): Promise<void> {
    const { backupSid, backupToken } = config;
    if (!backupSid || !backupToken) {
      throw new Error("Backup SMS credentials are not configured");
    }

    const url =
      config.backupUrl ||
      `https://api.twilio.com/2010-04-01/Accounts/${backupSid}/Messages.json`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: basicAuth(backupSid, backupToken),
      },
      body: new URLSearchParams({
        To: phoneNo,
        From: config.backupFrom,
        Body: text,
      }),
      signal: AbortSignal.timeout(BACKUP_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`Backup SMS provider returned status ${response.status}`);
    }
  }

  async function send(
    phoneNo: string,
    content: SmsContent,
  ): Promise<SmsDeliveryResult> {
    if (config.transport === "console") {
      log.info(
        { to: phoneNo, body: content.text },
        "SMS not dispatched (console transport)",
      );
      return { status: "logged" };
    }

    try {
      await sendViaPrimary(phoneNo, content.text);
      log.info({ to: phoneNo, provider: "primary" }, "SMS sent");
      return { status: "sent", provider: "primary" };
    } catch (primaryCause) {
      log.warn(
        { err: primaryCause, to: phoneNo },
        "Primary SMS gateway failed; falling back to backup",
      );

      try {
        await sendViaBackup(phoneNo, content.text);
        log.info({ to: phoneNo, provider: "backup" }, "SMS sent");
        return { status: "sent", provider: "backup" };
      } catch (backupCause) {
        const error =
          backupCause instanceof Error
            ? backupCause
            : new Error(String(backupCause));
        log.error(
          { err: error, to: phoneNo },
          "All SMS gateways failed; message not delivered",
        );
        return { status: "failed", error };
      }
    }
  }

  return { send };
}
