export interface SmsProviderResult {
  provider: string;
  messageId?: string | undefined;
  rawResponse?: unknown;
}

export interface SendOtpOptions {
  variables?: Record<string, string> | undefined;
  expiresInMinutes?: number | undefined;
}

export interface ISmsProvider {
  readonly name: string;
  isConfigured(): boolean;
  sendOtp(
    phoneNo: string,
    otp: string,
    options?: SendOtpOptions,
  ): Promise<SmsProviderResult>;
  sendText(phoneNo: string, text: string): Promise<SmsProviderResult>;
}

export type SmsProviderType = "msg91" | "vonage" | "twilio" | "console";
