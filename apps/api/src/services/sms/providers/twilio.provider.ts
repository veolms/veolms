import type { FastifyBaseLogger } from "fastify";
import type {
  ISmsProvider,
  SendOtpOptions,
  SmsProviderResult,
} from "../sms-provider.interface.ts";

export interface TwilioProviderConfig {
  backupUrl?: string | undefined;
  backupSid?: string | undefined;
  backupToken?: string | undefined;
  backupFrom: string;
}

const BACKUP_TIMEOUT_MS = 5000;

function basicAuth(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

export class TwilioProvider implements ISmsProvider {
  readonly name = "twilio";
  private readonly config: TwilioProviderConfig;
  private readonly log?: FastifyBaseLogger | undefined;

  constructor(
    config: TwilioProviderConfig,
    logger?: FastifyBaseLogger,
  ) {
    this.config = config;
    this.log = logger?.child({ provider: "twilio" });
  }

  isConfigured(): boolean {
    return Boolean(this.config.backupSid && this.config.backupToken);
  }

  async sendText(phoneNo: string, text: string): Promise<SmsProviderResult> {
    const { backupSid, backupToken } = this.config;
    if (!backupSid || !backupToken) {
      throw new Error("Twilio credentials are not configured");
    }

    const url =
      this.config.backupUrl ||
      `https://api.twilio.com/2010-04-01/Accounts/${backupSid}/Messages.json`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: basicAuth(backupSid, backupToken),
      },
      body: new URLSearchParams({
        To: phoneNo,
        From: this.config.backupFrom,
        Body: text,
      }),
      signal: AbortSignal.timeout(BACKUP_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`Twilio returned status ${response.status}`);
    }

    this.log?.info({ to: phoneNo }, "Twilio SMS sent successfully");
    return { provider: this.name };
  }

  async sendOtp(
    phoneNo: string,
    otp: string,
    options?: SendOtpOptions,
  ): Promise<SmsProviderResult> {
    const text = `${otp} is your verification code.`;
    return this.sendText(phoneNo, text);
  }
}
