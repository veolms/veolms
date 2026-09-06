import type { FastifyBaseLogger } from "fastify";
import type {
  ISmsProvider,
  SendOtpOptions,
  SmsProviderResult,
} from "../sms-provider.interface.ts";

export interface Msg91ProviderConfig {
  authKey?: string | undefined;
  templateId?: string | undefined;
  apiUrl?: string | undefined;
}

const MSG91_DEFAULT_API_URL = "https://control.msg91.com/api/v5/flow";
const MSG91_TIMEOUT_MS = 5000;

/**
 * Normalizes phone numbers for MSG91 flow API:
 * 1. Strips all non-digit characters (including '+', spaces, dashes, parentheses).
 * 2. If the recipient is a 10-digit Indian national number (e.g. '6358035535'),
 *    prepends country code 91 -> '916358035535'.
 * 3. If it starts with '0' followed by 10 digits (e.g. '06358035535'),
 *    replaces the leading '0' with '91' -> '916358035535'.
 * 4. If it is already 12 digits starting with '91', preserves '91...'.
 * 5. For international numbers (e.g. '+15551234567'), strips the '+' and
 *    retains the full international dial string ('15551234567').
 */
export function formatPhoneForMsg91(phoneNo: string): string {
  const digits = phoneNo.replace(/\D/g, "");

  if (digits.length === 10) {
    return `91${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("0")) {
    return `91${digits.slice(1)}`;
  }

  return digits;
}

export class Msg91Provider implements ISmsProvider {
  readonly name = "msg91";
  private readonly config: Msg91ProviderConfig;
  private readonly log?: FastifyBaseLogger | undefined;

  constructor(
    config: Msg91ProviderConfig,
    logger?: FastifyBaseLogger,
  ) {
    this.config = config;
    this.log = logger?.child({ provider: "msg91" });
  }

  isConfigured(): boolean {
    return Boolean(this.config.authKey && this.config.templateId);
  }

  async sendOtp(
    phoneNo: string,
    otp: string,
    options?: SendOtpOptions,
  ): Promise<SmsProviderResult> {
    if (!this.config.authKey || !this.config.templateId) {
      throw new Error("MSG91 credentials (authKey, templateId) are not configured");
    }

    const formattedMobile = formatPhoneForMsg91(phoneNo);
    const apiUrl = this.config.apiUrl || MSG91_DEFAULT_API_URL;

    const payload = {
      template_id: this.config.templateId,
      recipients: [
        {
          mobiles: formattedMobile,
          OTP: otp,
          ...(options?.variables ?? {}),
        },
      ],
    };

    this.log?.debug?.(
      { to: formattedMobile, templateId: this.config.templateId },
      "Dispatching OTP via MSG91 flow API",
    );

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authkey: this.config.authKey,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(MSG91_TIMEOUT_MS),
    });

    const responseText = await response.text();
    let json: Record<string, unknown> | undefined;

    try {
      json = JSON.parse(responseText) as Record<string, unknown>;
    } catch {
      // Non-JSON response
    }

    if (!response.ok) {
      const errorMsg =
        json && typeof json.message === "string"
          ? json.message
          : `HTTP status ${response.status}: ${responseText}`;
      this.log?.error(
        { status: response.status, responseText, to: formattedMobile },
        "MSG91 request failed",
      );
      throw new Error(`MSG91 returned error: ${errorMsg}`);
    }

    if (json && json.type === "error") {
      const errorMsg =
        typeof json.message === "string" ? json.message : JSON.stringify(json);
      this.log?.error(
        { json, to: formattedMobile },
        "MSG91 responded with error status",
      );
      throw new Error(`MSG91 rejected delivery: ${errorMsg}`);
    }

    const messageId =
      json && typeof json.message === "string" ? json.message : undefined;

    this.log?.info(
      { to: formattedMobile, messageId },
      "MSG91 OTP dispatched successfully",
    );

    return {
      provider: this.name,
      messageId,
      rawResponse: json ?? responseText,
    };
  }

  async sendText(phoneNo: string, text: string): Promise<SmsProviderResult> {
    // If text contains a 6-digit or 4-8 digit OTP code, extract and deliver it
    const otpMatch = text.match(/\b\d{4,8}\b/);
    if (otpMatch) {
      return this.sendOtp(phoneNo, otpMatch[0], {
        variables: { text },
      });
    }

    // MSG91 Flow is template-based, so OTP code is expected
    return this.sendOtp(phoneNo, "", {
      variables: { text },
    });
  }
}
