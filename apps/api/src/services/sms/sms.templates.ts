export interface SmsContent {
  text: string;
}

export interface OtpVerificationSmsInput {
  code: string;
  expiresInMinutes: number;
  academyName: string;
}

/**
 * Mirrors `otpVerificationEmail` so the two channels quote the same validity
 * window. Kept deliberately terse to stay inside a single SMS segment.
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
  };
}
