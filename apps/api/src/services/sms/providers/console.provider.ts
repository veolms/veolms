import type { FastifyBaseLogger } from "fastify";
import type {
  ISmsProvider,
  SendOtpOptions,
  SmsProviderResult,
} from "../sms-provider.interface.ts";

export class ConsoleProvider implements ISmsProvider {
  readonly name = "console";
  private readonly log?: FastifyBaseLogger | undefined;

  constructor(logger?: FastifyBaseLogger) {
    this.log = logger?.child({ provider: "console" });
  }

  isConfigured(): boolean {
    return true;
  }

  async sendOtp(
    phoneNo: string,
    otp: string,
    options?: SendOtpOptions,
  ): Promise<SmsProviderResult> {
    this.log?.info(
      { to: phoneNo, otp, variables: options?.variables },
      "[DEV] Verification OTP code (console provider)",
    );
    return { provider: this.name };
  }

  async sendText(phoneNo: string, text: string): Promise<SmsProviderResult> {
    this.log?.info(
      { to: phoneNo, text },
      "[DEV] SMS text message (console provider)",
    );
    return { provider: this.name };
  }
}
