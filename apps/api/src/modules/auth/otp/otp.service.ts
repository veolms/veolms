import crypto from "node:crypto";

import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";

import { AppError } from "../../../lib/errors.ts";
import {
  type AppServices,
  otpVerificationEmail,
  otpVerificationSms,
} from "@veolms/services";
import { config } from "../../../config.ts";
import {
  OTP_DAILY_LIMIT,
  OTP_DAILY_WINDOW_MS,
  OTP_IDENTIFIER_DAILY_CEILING,
  OTP_MAX_ATTEMPTS,
  OTP_TTL_MINUTES,
  OTP_TTL_MS,
  OTP_USER_DAILY_LIMIT,
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

/** Who is asking for a code; drives the per-requester send limits. */
export interface OtpRequester {
  ip?: string | null | undefined;
  userId?: string | null | undefined;
}

/** E.164: "+", country code, subscriber number — 8 to 15 digits in total. */
const E164_PHONE_PATTERN = /^\+[1-9]\d{7,14}$/u;

/**
 * SMS costs money per message and some destinations are premium-rate, so a
 * phone destination must be a well-formed international number and, when
 * the operator configured an allow-list, belong to a served country.
 */
function assertSmsDestinationAllowed(phoneNo: string): void {
  if (!E164_PHONE_PATTERN.test(phoneNo)) {
    throw new AppError(
      400,
      "INVALID_PHONE_NUMBER",
      "Enter a valid mobile number including its country code.",
    );
  }

  const allowed = config.SMS_ALLOWED_COUNTRY_CODES;
  if (allowed.length > 0 && !allowed.some((code) => phoneNo.startsWith(code))) {
    throw new AppError(
      400,
      "PHONE_COUNTRY_NOT_SUPPORTED",
      "Verification by SMS is not available for this country.",
    );
  }
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
    requester: OtpRequester,
  ): Promise<void> {
    const now = Date.now();
    const dailyLimitExceeded = () =>
      new AppError(
        429,
        "DAILY_LIMIT_EXCEEDED",
        "Too many verification code requests. Please try again tomorrow.",
      );

    const resendCooldownSeconds = config.OTP_RESEND_COOLDOWN_SECONDS;
    const recentlySent = await otpRepository.hasOtpSince(database, {
      identifier,
      identifierType,
      purpose,
      since: new Date(now - resendCooldownSeconds * 1000),
    });

    if (recentlySent) {
      throw new AppError(
        429,
        "RATE_LIMIT_EXCEEDED",
        `Please wait ${resendCooldownSeconds} ${
          resendCooldownSeconds === 1 ? "second" : "seconds"
        } before requesting another code.`,
      );
    }

    const daySince = new Date(now - OTP_DAILY_WINDOW_MS);

    // A signed-in user's sends are capped across ALL destinations: the
    // per-destination allowance alone let one session request codes for an
    // unlimited number of different phone numbers.
    if (requester.userId) {
      const sentByUser = await otpRepository.countOtpsRequestedByUserSince(
        database,
        { userId: requester.userId, since: daySince },
      );
      if (sentByUser >= OTP_USER_DAILY_LIMIT) throw dailyLimitExceeded();
    }

    // The daily allowance is counted per requesting address, so a stranger
    // requesting codes for someone else's address spends their own allowance
    // rather than the owner's. Without an address it falls back to the
    // destination-wide count.
    const sentByRequester = await otpRepository.countOtpsSince(database, {
      identifier,
      identifierType,
      purpose,
      since: daySince,
      requesterIp: requester.ip ?? undefined,
    });
    if (sentByRequester >= OTP_DAILY_LIMIT) throw dailyLimitExceeded();

    // Hard ceiling across every requester: bounds delivery cost and inbox
    // flooding when requests for one destination come from many addresses.
    if (requester.ip) {
      const sentToIdentifier = await otpRepository.countOtpsSince(database, {
        identifier,
        identifierType,
        purpose,
        since: daySince,
      });
      if (sentToIdentifier >= OTP_IDENTIFIER_DAILY_CEILING) {
        throw dailyLimitExceeded();
      }
    }
  }

  async function sendOtp(
    identifier: string,
    identifierType: IdentifierType,
    requester: OtpRequester = {},
  ): Promise<void> {
    const purpose = await resolveOtpPurpose(identifier, identifierType);
    await sendOtpWithPurpose(identifier, identifierType, purpose, requester);
  }

  async function sendOtpWithPurpose(
    identifier: string,
    identifierType: IdentifierType,
    purpose: OtpPurpose,
    requester: OtpRequester = {},
  ): Promise<void> {
    if (identifierType === "phone") assertSmsDestinationAllowed(identifier);
    await assertOtpSendAllowed(identifier, identifierType, purpose, requester);

    const code = crypto.randomInt(100_000, 1_000_000).toString();
    const now = new Date();

    await otpRepository.retireOutstandingOtps(database, {
      identifier,
      identifierType,
      purpose,
      now,
    });

    const otpId = crypto.randomUUID();
    await otpRepository.insertOtp(database, {
      id: otpId,
      identifier,
      identifierType,
      purpose,
      codeHash: hashToken(code),
      expiresAt: new Date(now.getTime() + OTP_TTL_MS),
      requesterIp: requester.ip,
      requesterUserId: requester.userId,
    });

    const delivery =
      identifierType === "email"
        ? await services.email.send(
            identifier,
            otpVerificationEmail({
              code,
              academyName,
              expiresInMinutes: OTP_TTL_MINUTES,
            }),
          )
        : await services.sms.send(
            identifier,
            otpVerificationSms({
              code,
              academyName,
              expiresInMinutes: OTP_TTL_MINUTES,
            }),
          );

    // "logged" (console transport) counts as delivered so local dev keeps working.
    if (delivery.status === "failed") {
      // Drop the undelivered code so the user can retry without hitting the
      // resend window or burning their daily quota.
      await otpRepository.deleteOtp(database, otpId);
      throw new AppError(
        503,
        "OTP_DELIVERY_FAILED",
        "We could not deliver a verification code. Please try again later.",
      );
    }
  }

  async function sendPhoneVerificationOtp(
    phoneNo: string,
    requester: OtpRequester = {},
  ): Promise<void> {
    await sendOtpWithPurpose(phoneNo, "phone", "phone_verification", requester);
  }

  async function sendEmailVerificationOtp(
    email: string,
    requester: OtpRequester = {},
  ): Promise<void> {
    await sendOtpWithPurpose(email, "email", "email_verification", requester);
  }

  const invalidCode = (statusCode = 401) =>
    new AppError(
      statusCode,
      "INVALID_CODE",
      "Verification code is invalid, expired, or revoked due to excessive attempts.",
    );

  async function verifyAndConsumeOtp(
    identifier: string,
    identifierType: IdentifierType,
    purpose: OtpPurpose,
    code: string,
  ): Promise<void> {
    const isVerificationPurpose =
      purpose === "phone_verification" || purpose === "email_verification";
    const failureStatus = isVerificationPurpose ? 400 : 401;

    const now = new Date();

    // Success path in one round trip. Any miss falls through to the two-step
    // path below, unchanged, so attempt accounting and failure responses
    // stay exactly as they were.
    const consumedDirectly = await otpRepository.consumeMatchingActiveOtp(
      database,
      {
        identifier,
        identifierType,
        purpose,
        codeHash: hashToken(code),
        now,
      },
    );
    if (consumedDirectly) return;

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

      throw invalidCode(failureStatus);
    }

    if (match.attempts >= OTP_MAX_ATTEMPTS) {
      throw invalidCode(failureStatus);
    }

    const consumed = await otpRepository.consumeOtp(database, match.id, now);
    if (!consumed) {
      throw new AppError(
        failureStatus,
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
