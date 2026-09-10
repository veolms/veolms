import type { FastifyBaseLogger } from "fastify";

import type {
  ISmsProvider,
  SendOtpOptions,
  SmsProviderType,
} from "./sms-provider.interface.ts";
import {
  Msg91Provider,
  type Msg91ProviderConfig,
} from "./providers/msg91.provider.ts";
import {
  VonageProvider,
  type VonageProviderConfig,
} from "./providers/vonage.provider.ts";
import {
  TwilioProvider,
  type TwilioProviderConfig,
} from "./providers/twilio.provider.ts";
import { ConsoleProvider } from "./providers/console.provider.ts";
import type { SmsContent } from "./sms.templates.ts";

export interface SmsProviderConfig {
  primaryUrl?: string | undefined;
  primaryKey?: string | undefined;
  primarySecret?: string | undefined;
  backupUrl?: string | undefined;
  backupSid?: string | undefined;
  backupToken?: string | undefined;
  backupFrom?: string | undefined;
  msg91?: Msg91ProviderConfig | undefined;
}

export interface SmsTransportConfig extends SmsProviderConfig {
  /**
   * Selection strategy for the SMS provider:
   * - "auto": selects MSG91 when configured, then Vonage, then Twilio, then console.
   * - "msg91": forces MSG91 Flow API as primary provider.
   * - "vonage": forces Vonage/Nexmo as primary provider.
   * - "twilio": forces Twilio as primary provider.
   * - "console": forces console logging (no network dispatch).
   */
  provider?: "auto" | SmsProviderType | undefined;
  /** `console` renders the message to the logger and dispatches nothing. */
  transport?: "http" | "console" | undefined;
  senderId?: string | undefined;
}

export interface SmsServiceOptions {
  config: SmsTransportConfig;
  logger: FastifyBaseLogger;
}

export type SmsDeliveryResult =
  | { status: "sent"; provider: string; messageId?: string | undefined }
  | { status: "logged" }
  | { status: "failed"; error: Error };

export interface SmsService {
  /**
   * Dispatches a message or OTP, failing over across configured providers.
   * Never throws, guaranteeing fire-and-forget safety.
   */
  send(phoneNo: string, content: SmsContent): Promise<SmsDeliveryResult>;

  /**
   * Directly dispatches an OTP verification code with optional template variables.
   */
  sendOtp(
    phoneNo: string,
    otp: string,
    options?: SendOtpOptions,
  ): Promise<SmsDeliveryResult>;
}

export function createSmsService({
  config,
  logger,
}: SmsServiceOptions): SmsService {
  const log = logger.child({ service: "sms" });

  // Instantiate available providers
  const consoleProvider = new ConsoleProvider(logger);
  const msg91Provider = new Msg91Provider(config.msg91 ?? {}, logger);
  const vonageProvider = new VonageProvider(
    {
      primaryUrl: config.primaryUrl ?? "https://api.nexmo.com/v1/messages",
      primaryKey: config.primaryKey,
      primarySecret: config.primarySecret,
      senderId: config.senderId ?? "VeoLMS",
    },
    logger,
  );
  const twilioProvider = new TwilioProvider(
    {
      backupUrl: config.backupUrl,
      backupSid: config.backupSid,
      backupToken: config.backupToken,
      backupFrom: config.backupFrom ?? "+1234567890",
    },
    logger,
  );

  /**
   * Builds the failover chain of providers based on configuration and availability.
   */
  function resolveProviderChain(): ISmsProvider[] {
    if (config.transport === "console" || config.provider === "console") {
      return [consoleProvider];
    }

    const available: Record<SmsProviderType, ISmsProvider> = {
      msg91: msg91Provider,
      vonage: vonageProvider,
      twilio: twilioProvider,
      console: consoleProvider,
    };

    const preferred = config.provider ?? "auto";

    if (preferred !== "auto" && available[preferred]) {
      const primary = available[preferred];
      const others = [msg91Provider, vonageProvider, twilioProvider].filter(
        (p) => p !== primary && p.isConfigured(),
      );
      return primary.isConfigured() ? [primary, ...others] : others;
    }

    // Auto strategy: prefer MSG91 if credentials exist, then Vonage, then Twilio
    const chain: ISmsProvider[] = [];
    if (msg91Provider.isConfigured()) chain.push(msg91Provider);
    if (vonageProvider.isConfigured()) chain.push(vonageProvider);
    if (twilioProvider.isConfigured()) chain.push(twilioProvider);

    if (chain.length === 0) {
      chain.push(consoleProvider);
    }

    return chain;
  }

  const providers = resolveProviderChain();
  log.info(
    { providers: providers.map((p) => p.name) },
    "Initialized SMS service with provider failover chain",
  );

  async function sendOtp(
    phoneNo: string,
    otp: string,
    options?: SendOtpOptions,
  ): Promise<SmsDeliveryResult> {
    let lastError: Error | undefined;

    for (const provider of providers) {
      if (provider.name === "console") {
        await provider.sendOtp(phoneNo, otp, options);
        return { status: "logged" };
      }

      try {
        const result = await provider.sendOtp(phoneNo, otp, options);
        log.info(
          { to: phoneNo, provider: result.provider, messageId: result.messageId },
          "SMS OTP delivered successfully",
        );
        return {
          status: "sent",
          provider: result.provider,
          messageId: result.messageId,
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        log.warn(
          { err: lastError, provider: provider.name, to: phoneNo },
          "SMS OTP dispatch failed on provider; checking next provider in failover chain",
        );
      }
    }

    const failureError =
      lastError ?? new Error("No configured SMS providers available");
    log.error(
      { err: failureError, to: phoneNo },
      "All SMS providers failed; OTP was not delivered",
    );
    return { status: "failed", error: failureError };
  }

  async function send(
    phoneNo: string,
    content: SmsContent,
  ): Promise<SmsDeliveryResult> {
    // If an OTP code was supplied, use the dedicated sendOtp flow
    if (content.code) {
      return sendOtp(phoneNo, content.code, {
        variables: content.templateVariables,
      });
    }

    let lastError: Error | undefined;

    for (const provider of providers) {
      if (provider.name === "console") {
        await provider.sendText(phoneNo, content.text);
        return { status: "logged" };
      }

      try {
        const result = await provider.sendText(phoneNo, content.text);
        log.info(
          { to: phoneNo, provider: result.provider, messageId: result.messageId },
          "SMS text delivered successfully",
        );
        return {
          status: "sent",
          provider: result.provider,
          messageId: result.messageId,
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        log.warn(
          { err: lastError, provider: provider.name, to: phoneNo },
          "SMS text dispatch failed on provider; attempting failover",
        );
      }
    }

    const failureError =
      lastError ?? new Error("No configured SMS providers available");
    log.error(
      { err: failureError, to: phoneNo },
      "All SMS providers failed; text message was not delivered",
    );
    return { status: "failed", error: failureError };
  }

  return { send, sendOtp };
}
