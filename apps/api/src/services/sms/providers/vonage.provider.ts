import type { FastifyBaseLogger } from "fastify";
import type {
  ISmsProvider,
  SendOtpOptions,
  SmsProviderResult,
} from "../sms-provider.interface.ts";

export interface VonageProviderConfig {
  primaryUrl: string;
  primaryKey?: string | undefined;
  primarySecret?: string | undefined;
  senderId: string;
}

const PRIMARY_TIMEOUT_MS = 4000;

function basicAuth(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

export class VonageProvider implements ISmsProvider {
  readonly name = "vonage";
  private readonly config: VonageProviderConfig;
  private readonly log?: FastifyBaseLogger | undefined;

  constructor(
    config: VonageProviderConfig,
    logger?: FastifyBaseLogger,
  ) {
    this.config = config;
    this.log = logger?.child({ provider: "vonage" });
  }

  isConfigured(): boolean {
    return Boolean(this.config.primaryKey && this.config.primarySecret);
  }

  async sendText(phoneNo: string, text: string): Promise<SmsProviderResult> {
    const { primaryKey, primarySecret } = this.config;
    if (!primaryKey || !primarySecret) {
      throw new Error("Vonage/Nexmo SMS credentials are not configured");
    }

    const response = await fetch(this.config.primaryUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: basicAuth(primaryKey, primarySecret),
      },
      body: JSON.stringify({
        from: this.config.senderId,
        to: phoneNo,
        message_type: "text",
        text,
      }),
      signal: AbortSignal.timeout(PRIMARY_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`Vonage/Nexmo returned status ${response.status}`);
    }

    this.log?.info({ to: phoneNo }, "Vonage SMS sent successfully");
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
