import crypto from "node:crypto";

import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";

import { AppError } from "../../../lib/errors.ts";
import type { AppServices } from "../../../services/index.ts";
import { otpVerificationEmail } from "../../../services/email/index.ts";
import { otpVerificationSms } from "../../../services/sms/index.ts";
import {
  OTP_DAILY_LIMIT,
  OTP_DAILY_WINDOW_MS,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_WINDOW_MS,
  OTP_TTL_MINUTES,
  OTP_TTL_MS,
} from "../shared/auth.constants.ts";
import type { IdentifierType, OtpPurpose } from "../shared/auth.types.ts";
import * as otpRepository from "./otp.repository.ts";
import * as userRepository from "../authentication/authentication.repository.ts";
import { hashToken } from "../shared/auth.utils.ts";

export interface OtpServiceOptions {
  database: Kysely<Database>;
  services: AppServices;
  academyName: string;
}

export function createOtpService({
  database,
  services,
  academyName,
}: OtpServiceOptions) {
  /** Existing accounts get a login code; unknown identifiers get a signup code. */
  async function resolveOtpPurpose(
    identifier: string,
    identifierType: IdentifierType,
  ): Promise<OtpPurpose> {
    const user = await userRepository.findUserByIdentifierIncludingDeleted(
      database,
      identifier,
      identifierType,
    );

    if (user) {
      if (user.is_deleted) {
        throw new AppError(
          403,
          "ACCOUNT_DEACTIVATED",
          "This account has been deactivated.",
        );
      }
      return "login";
    }

    return identifierType === "email"
      ? "email_verification"
      : "phone_verification";
  }

  async function assertOtpSendAllowed(
    identifier: string,
    identifierType: IdentifierType,
    purpose: OtpPurpose,
  ): Promise<void> {
    const now = Date.now();

    const recentlySent = await otpRepository.hasOtpSince(database, {
      identifier,
      identifierType,
      purpose,
      since: new Date(now - OTP_RESEND_WINDOW_MS),
    });

    if (recentlySent) {
      throw new AppError(
        429,
        "RATE_LIMIT_EXCEEDED",
        "Please wait 60 seconds before requesting another code.",
      );
    }

    const sentToday = await otpRepository.countOtpsSince(database, {
      identifier,
      identifierType,
      purpose,
      since: new Date(now - OTP_DAILY_WINDOW_MS),
    });

    if (sentToday >= OTP_DAILY_LIMIT) {
      throw new AppError(
        429,
        "DAILY_LIMIT_EXCEEDED",
        "Too many verification code requests. Please try again tomorrow.",
      );
    }
  }

  async function sendOtp(
    identifier: string,
    identifierType: IdentifierType,
  ): Promise<void> {
    const purpose = await resolveOtpPurpose(identifier, identifierType);
    await sendOtpWithPurpose(identifier, identifierType, purpose);
  }

  async function sendOtpWithPurpose(
    identifier: string,
    identifierType: IdentifierType,
    purpose: OtpPurpose,
  ): Promise<void> {
    await assertOtpSendAllowed(identifier, identifierType, purpose);

    const code = crypto.randomInt(100_000, 1_000_000).toString();
    const now = new Date();

    await otpRepository.retireOutstandingOtps(database, {
      identifier,
      identifierType,
      purpose,
      now,
    });

    await otpRepository.insertOtp(database, {
      id: crypto.randomUUID(),
      identifier,
      identifierType,
      purpose,
      codeHash: hashToken(code),
      expiresAt: new Date(now.getTime() + OTP_TTL_MS),
    });

    if (identifierType === "email") {
      void services.email.send(
        identifier,
        otpVerificationEmail({
          code,
          academyName,
          expiresInMinutes: OTP_TTL_MINUTES,
        }),
      );
      return;
    }

    void services.sms.send(
      identifier,
      otpVerificationSms({
        code,
        academyName,
        expiresInMinutes: OTP_TTL_MINUTES,
      }),
    );
  }

  async function sendPhoneVerificationOtp(phoneNo: string): Promise<void> {
    await sendOtpWithPurpose(phoneNo, "phone", "phone_verification");
  }

  async function sendEmailVerificationOtp(email: string): Promise<void> {
    await sendOtpWithPurpose(email, "email", "email_verification");
  }

  const invalidCode = () =>
    new AppError(
      401,
      "INVALID_CODE",
      "Verification code is invalid, expired, or revoked due to excessive attempts.",
    );

  async function verifyAndConsumeOtp(
    identifier: string,
    identifierType: IdentifierType,
    purpose: OtpPurpose,
    code: string,
  ): Promise<void> {
    const now = new Date();

    const match = await otpRepository.findMatchingActiveOtp(database, {
      identifier,
      identifierType,
      purpose,
      codeHash: hashToken(code),
      now,
    });

    if (!match) {
      const outstanding = await otpRepository.findOutstandingOtp(database, {
        identifier,
        identifierType,
        purpose,
        now,
      });

      if (outstanding) {
        await otpRepository.recordOtpAttempt(database, outstanding.id, now);
      }

      throw invalidCode();
    }

    if (match.attempts >= OTP_MAX_ATTEMPTS) {
      throw invalidCode();
    }

    const consumed = await otpRepository.consumeOtp(database, match.id, now);
    if (!consumed) {
      throw new AppError(
        401,
        "INVALID_CODE",
        "Verification code was already used or invalidated.",
      );
    }
  }

  return {
    resolveOtpPurpose,
    sendOtp,
    sendPhoneVerificationOtp,
    sendEmailVerificationOtp,
    verifyAndConsumeOtp,
  };
}

export type OtpService = ReturnType<typeof createOtpService>;
