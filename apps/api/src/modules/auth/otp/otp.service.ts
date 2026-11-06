import crypto from "node:crypto";
import { BlockList, isIP } from "node:net";

import type { AcademyBrandResponse } from "@veolms/contracts";
import type { Database } from "@veolms/database";
import { sql, type Kysely } from "kysely";

import { AppError } from "../../../lib/errors.ts";
import {
  type AppServices,
  deactivatedAccountSignInEmail,
  otpVerificationEmail,
  otpVerificationSms,
} from "@veolms/services";
import { config } from "../../../config.ts";
import {
  OTP_DAILY_LIMIT,
  OTP_DAILY_WINDOW_MS,
  OTP_IDENTIFIER_DAILY_CEILING,
  OTP_IP_WINDOW_MS,
  OTP_MAX_ATTEMPTS,
  OTP_USER_DAILY_LIMIT,
  STUDENT_ROLE,
} from "../shared/auth.constants.ts";
import type { IdentifierType, OtpPurpose } from "../shared/auth.types.ts";
import type { Executor } from "../shared/repository.types.ts";
import * as otpRepository from "./otp.repository.ts";
import * as userRepository from "../authentication/authentication.repository.ts";
import { hashToken } from "../shared/auth.utils.ts";

export interface OtpServiceOptions {
  database: Kysely<Database>;
  services: AppServices;
  /** The academy's name and logo, which its emails carry. */
  getAcademyBrand: () => Promise<AcademyBrandResponse>;
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

/**
 * Addresses that cannot be a client's own: loopback, private and link-local
 * ranges. A request shows one of these when the API sits behind a reverse
 * proxy it has not been told to trust (TRUST_PROXY), so every visitor
 * arrives with the proxy's address.
 */
const nonClientAddresses = new BlockList();
nonClientAddresses.addSubnet("127.0.0.0", 8, "ipv4");
nonClientAddresses.addSubnet("10.0.0.0", 8, "ipv4");
nonClientAddresses.addSubnet("172.16.0.0", 12, "ipv4");
nonClientAddresses.addSubnet("192.168.0.0", 16, "ipv4");
nonClientAddresses.addSubnet("169.254.0.0", 16, "ipv4");
nonClientAddresses.addAddress("::1", "ipv6");
nonClientAddresses.addSubnet("fc00::", 7, "ipv6");
nonClientAddresses.addSubnet("fe80::", 10, "ipv6");

/**
 * Whether per-address allowances can be counted against this address.
 * Counted against a proxy's address they would be one allowance shared by
 * the whole platform, and a busy hour would lock every visitor out.
 */
function identifiesClient(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return false;
  return !nonClientAddresses.check(address, family === 6 ? "ipv6" : "ipv4");
}

export function createOtpService({
  database,
  services,
  getAcademyBrand,
}: OtpServiceOptions) {
  /**
   * Existing accounts get a login code; unknown identifiers get a signup
   * code. A deactivated account gets none: `null`.
   */
  async function resolveOtpPurpose(
    identifier: string,
    identifierType: IdentifierType,
  ): Promise<OtpPurpose | null> {
    const user = await userRepository.findUserStatusByIdentifier(
      database,
      identifier,
      identifierType,
    );

    if (user) return user.is_deleted ? null : "login";

    return identifierType === "email"
      ? "email_verification"
      : "phone_verification";
  }

  async function assertOtpSendAllowed(
    database: Executor,
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

    // Per network address, across every destination. The route's own limit
    // is kept in each API process; these are counted from the stored codes,
    // so every instance sees the same numbers.
    if (requester.ip && identifiesClient(requester.ip)) {
      if (config.OTP_IP_WINDOW_LIMIT > 0) {
        const sentFromAddress =
          await otpRepository.countOtpsRequestedFromIpSince(database, {
            requesterIp: requester.ip,
            since: new Date(now - OTP_IP_WINDOW_MS),
          });
        if (sentFromAddress >= config.OTP_IP_WINDOW_LIMIT) {
          throw new AppError(
            429,
            "RATE_LIMIT_EXCEEDED",
            "Too many verification code requests. Please try again in a few minutes.",
          );
        }
      }

      // Sign-up codes go to addresses and numbers nobody has confirmed, so
      // one sender is also held to a number of different strangers a day.
      // Once an address has reached that number, every request it makes
      // without signing in is refused, whoever the code is for. Refusing
      // only the sign-up codes would answer differently for a destination
      // with an account and one without, and tell them apart.
      if (!requester.userId && config.OTP_IP_DAILY_SIGNUP_LIMIT > 0) {
        const otherDestinations =
          await otpRepository.countSignupDestinationsFromIpSince(database, {
            requesterIp: requester.ip,
            since: daySince,
            excluding: { identifier, identifierType },
          });
        if (otherDestinations >= config.OTP_IP_DAILY_SIGNUP_LIMIT) {
          throw dailyLimitExceeded();
        }
      }
    }

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
    if (purpose === null) {
      await sendDeactivatedAccountNotice(identifier, identifierType, requester);
      return;
    }
    const fixedCode = await resolveTestLoginCode(identifier, identifierType);
    await sendOtpWithPurpose(
      identifier,
      identifierType,
      purpose,
      requester,
      fixedCode,
    );
  }

  /**
   * The fixed code of a shared test account (TEST_LOGIN_ACCOUNTS), or null
   * when the identifier is an ordinary one. The pair is public by design, so
   * an account holding any role other than student never gets it and falls
   * back to an emailed code: a mistyped address in the setting must not open
   * a staff account. A deactivated account never reaches this: it is
   * answered by the notice above and gets no code at all.
   */
  async function resolveTestLoginCode(
    identifier: string,
    identifierType: IdentifierType,
  ): Promise<string | null> {
    if (identifierType !== "email") return null;
    const fixedCode = config.TEST_LOGIN_ACCOUNTS.get(identifier);
    if (!fixedCode) return null;

    const user = await userRepository.findUserStatusByIdentifier(
      database,
      identifier,
      identifierType,
    );
    if (user) {
      const roles = await userRepository.listUserRoleNames(database, user.id);
      if (roles.some((role) => role !== STUDENT_ROLE)) return null;
    }
    return fixedCode;
  }

  /**
   * A deactivated account's address is answered like any other: the same
   * limits, the same success, the same failures. Saying "deactivated" here
   * told anyone who asked that the address had an account. No code is
   * issued. The owner of an email address is told why, and where to turn,
   * in a message only they receive; a number gets no text, since a notice
   * is not a message the SMS templates cover.
   */
  async function sendDeactivatedAccountNotice(
    identifier: string,
    identifierType: IdentifierType,
    requester: OtpRequester,
  ): Promise<void> {
    // Recorded as an already-spent code so the resend wait and the daily
    // allowances apply exactly as they do for an active account.
    const placeholderId = await recordRefusedSend(
      identifier,
      identifierType,
      "login",
      requester,
    );

    if (identifierType !== "email") return;

    const brand = await getAcademyBrand();
    const delivery = await services.email.send(
      identifier,
      deactivatedAccountSignInEmail({
        academyName: brand.name,
        logoUrl: brand.logoUrl,
      }),
    );
    if (delivery.status === "failed") {
      await otpRepository.deleteOtp(database, placeholderId);
      throw new AppError(
        503,
        "OTP_DELIVERY_FAILED",
        "We could not deliver a verification code. Please try again later.",
      );
    }
  }

  /**
   * Counts a request that will get no code against the requester's
   * allowances, as though a code had been sent: the same checks, and a
   * stored entry that is already spent. Nothing can match it: it is
   * consumed, and its hash is of a random token. Used where telling the
   * caller "no code for this one" for free would let them test destinations
   * without limit. Returns the entry's id.
   *
   * `countAgainstDestination: false` charges the requester alone. The entry
   * is then filed under a stand-in for the destination, so it does not use
   * up the resend wait or the daily allowance of whoever really owns that
   * address or number: someone else asking about it must not be able to
   * keep its owner from getting a code.
   */
  async function recordRefusedSend(
    destination: string,
    identifierType: IdentifierType,
    purpose: OtpPurpose,
    requester: OtpRequester,
    options: { countAgainstDestination?: boolean } = {},
  ): Promise<string> {
    if (identifierType === "phone") assertSmsDestinationAllowed(destination);

    // The stand-in is per requester as well: two people asking about the
    // same number must not share a resend wait either.
    const identifier =
      options.countAgainstDestination === false
        ? `refused:${hashToken(`${requester.userId ?? requester.ip ?? ""}:${destination}`)}`
        : destination;
    const placeholderId = crypto.randomUUID();

    await database.transaction().execute(async (transaction) => {
      await sql`select pg_advisory_xact_lock(hashtext(${`veolms:otp-send:${identifierType}:${purpose}:${identifier}`}))`.execute(
        transaction,
      );

      await assertOtpSendAllowed(
        transaction,
        identifier,
        identifierType,
        purpose,
        requester,
      );

      const now = new Date();
      await otpRepository.insertOtp(transaction, {
        id: placeholderId,
        identifier,
        identifierType,
        purpose,
        codeHash: hashToken(crypto.randomBytes(32).toString("hex")),
        expiresAt: now,
        requesterIp: requester.ip,
        requesterUserId: requester.userId,
      });
      await otpRepository.retireOutstandingOtps(transaction, {
        identifier,
        identifierType,
        purpose,
        now,
      });
    });

    return placeholderId;
  }

  async function sendOtpWithPurpose(
    identifier: string,
    identifierType: IdentifierType,
    purpose: OtpPurpose,
    requester: OtpRequester = {},
    fixedCode: string | null = null,
  ): Promise<void> {
    if (identifierType === "phone") assertSmsDestinationAllowed(identifier);

    // On a developer's machine every code is the fixed one (LOCAL_FIXED_OTP)
    // and, like a test account's, it is neither sent nor held to the limits.
    const localCode =
      config.NODE_ENV === "development"
        ? (config.LOCAL_FIXED_OTP ?? null)
        : null;
    const presetCode = fixedCode ?? localCode;
    const code = presetCode ?? crypto.randomInt(100_000, 1_000_000).toString();
    const otpId = crypto.randomUUID();

    // The allowance checks, retiring the previous code and storing the new
    // one run as one unit per destination. Run separately, requests arriving
    // together each passed the resend check before any of them had stored a
    // code, leaving several live codes and several times the guesses.
    await database.transaction().execute(async (transaction) => {
      await sql`select pg_advisory_xact_lock(hashtext(${`veolms:otp-send:${identifierType}:${purpose}:${identifier}`}))`.execute(
        transaction,
      );

      // A test account is shared, so its testers would spend each other's
      // resend window and daily allowance; nothing is delivered for it
      // either. Its code is still retired and stored under the lock, so
      // there is one live code for it like for any other address.
      if (!presetCode) {
        await assertOtpSendAllowed(
          transaction,
          identifier,
          identifierType,
          purpose,
          requester,
        );
      }

      const now = new Date();
      await otpRepository.retireOutstandingOtps(transaction, {
        identifier,
        identifierType,
        purpose,
        now,
      });

      await otpRepository.insertOtp(transaction, {
        id: otpId,
        identifier,
        identifierType,
        purpose,
        codeHash: hashToken(code),
        expiresAt: new Date(now.getTime() + config.OTP_TTL_MINUTES * 60_000),
        requesterIp: requester.ip,
        requesterUserId: requester.userId,
      });
    });

    if (presetCode) return;

    const brand = await getAcademyBrand();
    const delivery =
      identifierType === "email"
        ? await services.email.send(
            identifier,
            otpVerificationEmail({
              code,
              academyName: brand.name,
              logoUrl: brand.logoUrl,
              expiresInMinutes: config.OTP_TTL_MINUTES,
            }),
          )
        : await services.sms.send(
            identifier,
            otpVerificationSms({
              code,
              academyName: brand.name,
              expiresInMinutes: config.OTP_TTL_MINUTES,
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

  /**
   * The hash of a shared test account's fixed code (TEST_LOGIN_ACCOUNTS), or
   * null for an ordinary address. Several testers use that one code, so one
   * tester signing in or mistyping must not spend it for the others: a code
   * stored with this hash is neither consumed nor charged wrong guesses. An
   * account that was refused the fixed code (resolveTestLoginCode) holds an
   * emailed one-time code instead, whose hash differs, and is unaffected.
   */
  function sharedTestCodeHash(
    identifier: string,
    identifierType: IdentifierType,
  ): string | null {
    if (identifierType !== "email") return null;
    const fixedCode = config.TEST_LOGIN_ACCOUNTS.get(identifier);
    return fixedCode ? hashToken(fixedCode) : null;
  }

  /**
   * Charges a wrong guess to the outstanding code, which is retired after
   * OTP_MAX_ATTEMPTS. A shared test account's fixed code is not charged.
   */
  async function recordWrongGuess(
    identifier: string,
    identifierType: IdentifierType,
    purpose: OtpPurpose,
    now: Date,
  ): Promise<void> {
    const outstanding = await otpRepository.findOutstandingOtp(database, {
      identifier,
      identifierType,
      purpose,
      now,
    });
    if (!outstanding) return;
    if (
      outstanding.code_hash === sharedTestCodeHash(identifier, identifierType)
    )
      return;
    await otpRepository.recordOtpAttempt(database, outstanding.id, now);
  }

  function failureStatusFor(purpose: OtpPurpose): number {
    return purpose === "phone_verification" || purpose === "email_verification"
      ? 400
      : 401;
  }

  /**
   * Checks a code and leaves it usable. A caller that must not reveal
   * anything about the account until the code is proven checks here first
   * and consumes the code later with verifyAndConsumeOtp. A wrong code
   * counts against the outstanding one exactly as it does there.
   */
  async function assertOtpMatches(
    identifier: string,
    identifierType: IdentifierType,
    purpose: OtpPurpose,
    code: string,
    options: { failureStatus?: number } = {},
  ): Promise<void> {
    const failureStatus = options.failureStatus ?? failureStatusFor(purpose);
    const now = new Date();

    const match = await otpRepository.findMatchingActiveOtp(database, {
      identifier,
      identifierType,
      purpose,
      codeHash: hashToken(code),
      now,
    });

    if (!match) {
      await recordWrongGuess(identifier, identifierType, purpose, now);
      throw invalidCode(failureStatus);
    }

    if (match.attempts >= OTP_MAX_ATTEMPTS) {
      throw invalidCode(failureStatus);
    }
  }

  async function verifyAndConsumeOtp(
    identifier: string,
    identifierType: IdentifierType,
    purpose: OtpPurpose,
    code: string,
  ): Promise<void> {
    const failureStatus = failureStatusFor(purpose);

    const now = new Date();
    const codeHash = hashToken(code);
    const isSharedTestCode =
      codeHash === sharedTestCodeHash(identifier, identifierType);

    // A test account signs in with its fixed code whether or not a code is
    // stored for it: a browser that remembers having asked for one does not
    // ask again, so the stored one may have run out or been retired. The
    // same checks as when the code is issued decide (resolveTestLoginCode),
    // so an account refused the fixed code still needs its emailed one.
    if (
      isSharedTestCode &&
      purpose === "login" &&
      (await resolveTestLoginCode(identifier, identifierType)) === code
    ) {
      return;
    }

    // Success path in one round trip. Any miss falls through to the two-step
    // path below, unchanged, so attempt accounting and failure responses
    // stay exactly as they were.
    if (!isSharedTestCode) {
      const consumedDirectly = await otpRepository.consumeMatchingActiveOtp(
        database,
        { identifier, identifierType, purpose, codeHash, now },
      );
      if (consumedDirectly) return;
    }

    const match = await otpRepository.findMatchingActiveOtp(database, {
      identifier,
      identifierType,
      purpose,
      codeHash,
      now,
    });

    if (!match) {
      await recordWrongGuess(identifier, identifierType, purpose, now);
      throw invalidCode(failureStatus);
    }

    if (match.attempts >= OTP_MAX_ATTEMPTS) {
      throw invalidCode(failureStatus);
    }

    // Left live for the other testers of the shared account.
    if (isSharedTestCode) return;

    const consumed = await otpRepository.consumeOtp(database, match.id, now);
    if (!consumed) {
      throw new AppError(
        failureStatus,
        "INVALID_CODE",
        "Verification code was already used or invalidated.",
      );
    }
  }

  /**
   * Spends a code inside the caller's transaction, so the code and what it
   * pays for are written together or not at all: a registration that fails
   * while the account is being created leaves the code usable.
   *
   * The caller has already proven the code with assertOtpMatches, which is
   * where a wrong guess is counted. A miss here means the code was used,
   * replaced or ran out in the meantime, and nothing is written for it.
   */
  async function consumeOtpWithin(
    transaction: Executor,
    identifier: string,
    identifierType: IdentifierType,
    purpose: OtpPurpose,
    code: string,
  ): Promise<void> {
    const codeHash = hashToken(code);
    const now = new Date();

    // A shared test account's code is checked and left live, as in
    // verifyAndConsumeOtp.
    if (codeHash === sharedTestCodeHash(identifier, identifierType)) {
      const match = await otpRepository.findMatchingActiveOtp(transaction, {
        identifier,
        identifierType,
        purpose,
        codeHash,
        now,
      });
      if (!match || match.attempts >= OTP_MAX_ATTEMPTS) {
        throw invalidCode(failureStatusFor(purpose));
      }
      return;
    }

    const consumed = await otpRepository.consumeMatchingActiveOtp(transaction, {
      identifier,
      identifierType,
      purpose,
      codeHash,
      now,
    });
    if (!consumed) throw invalidCode(failureStatusFor(purpose));
  }

  return {
    resolveOtpPurpose,
    sendOtp,
    sendPhoneVerificationOtp,
    sendEmailVerificationOtp,
    recordRefusedSend,
    assertOtpMatches,
    verifyAndConsumeOtp,
    consumeOtpWithin,
  };
}

export type OtpService = ReturnType<typeof createOtpService>;
