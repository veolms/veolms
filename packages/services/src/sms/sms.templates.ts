export interface SmsContent {
  text: string;
  code?: string | undefined;
  templateVariables?: Record<string, string> | undefined;
}

export interface OtpVerificationSmsInput {
  code: string;
  expiresInMinutes: number;
  academyName: string;
}

/**
 * Generates SMS text and template variables for OTP verification.
 */
export function otpVerificationSms({
  code,
  expiresInMinutes,
  academyName,
}: OtpVerificationSmsInput): SmsContent {
  return {
    text: `${code} is your ${academyName} verification code. It expires in ${expiresInMinutes} minute${
      expiresInMinutes === 1 ? "" : "s"
    }.`,
    code,
    templateVariables: {
      OTP: code,
      otp: code,
      code,
      academyName,
      expiresInMinutes: String(expiresInMinutes),
    },
  };
}
