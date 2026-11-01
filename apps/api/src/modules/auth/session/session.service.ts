import crypto from "node:crypto";
import { isIP } from "node:net";

import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";

import { config } from "../../../config.ts";
import { AppError } from "../../../lib/errors.ts";
import {
  SESSION_TTL_MS,
  SESSION_USER_AGENT_MAX_LENGTH,
} from "../shared/auth.constants.ts";
import {
  isMfaMandatoryAccount,
  isStaffAccount,
  skipsStaffMfa,
} from "../shared/mfa-policy.ts";
import type {
  AuthenticatedRequestContext,
  EstablishedSession,
  MfaState,
  SessionUser,
} from "../shared/auth.types.ts";
import type { ActiveSession } from "./session.repository.ts";
import * as mfaRepository from "../mfa/mfa.repository.ts";
import * as sessionRepository from "./session.repository.ts";
import * as userRepository from "../authentication/authentication.repository.ts";
import {
  generateRandomToken,
  hashToken,
  isTestLoginAccount,
  toUserProfileFields,
} from "../shared/auth.utils.ts";
import {
  clearSessionAuthCache,
  getAuthContext,
} from "../shared/session-auth-cache.ts";
import { createOutboxService } from "../../../events/outbox.service.ts";
import type { Executor } from "../shared/repository.types.ts";
import { runSignInClaim } from "../shared/sign-in-claim.ts";
import { type SessionLocation } from "../shared/request-location.ts";
import { createPlatformSettingsService } from "../../platform/platform-settings.service.ts";
import type { OtpService } from "../otp/otp.service.ts";

/** How long a sign-in may wait for its student to sign another device out. */
export const PENDING_DEVICE_SIGN_IN_TTL_MS = 10 * 60_000;

/**
 * A student already signed in on as many devices as the academy allows
 * (Platform > Security). The sign-in is kept waiting under `signInToken`,
 * which goes to the browser in a cookie; signing one of the other devices
 * out lets it in (`resolveDeviceLimit`).
 */
export class DeviceLimitReachedError extends AppError {
  readonly signInToken: string;

  constructor(signInToken: string) {
    super(
      409,
      "DEVICE_LIMIT_REACHED",
      "You are signed in on as many devices as your academy allows. Sign out of one to sign in here.",
    );
    this.name = "DeviceLimitReachedError";
    this.signInToken = signInToken;
  }
}

export interface SessionServiceOptions {
  database: Kysely<Database>;
  otpService?: OtpService;
}

/**
 * Everything establishSession reads before it writes. Loaded as one batch so
 * a caller can overlap it with other independent work (login overlaps it
 * with OTP consumption).
 */
export interface SessionPrerequisites {
  roles: string[];
  totpEnabled: boolean;
  passkeyCount: number;
  existingTokenHash: string | null;
  existingSession: ActiveSession | null;
}

const ACTIVE_SESSIONS_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

export function createSessionService({
  database,
  otpService,
}: SessionServiceOptions) {
  const outbox = createOutboxService();
  const platformSettings = createPlatformSettingsService({ database });

  /**
   * Whether two-factor sign-in is off for this account: it is for staff
   * only (admins and every team role), so a student is never asked for a
   * second step, whatever factor an older version let them enrol.
   */
  function isTwoFactorOffFor(roles: readonly string[]) {
    return !isStaffAccount(roles);
  }

  /**
   * Same rules as resolveMfaState, for factor facts that are already loaded.
   * `twoFactorOff` is the student rule (see isTwoFactorOffFor).
   */
  function buildMfaState(
    mfaMandatory: boolean,
    roles: readonly string[] | null | undefined,
    factors: { totpEnabled: boolean; passkeyCount: number },
    twoFactorOff = false,
  ): MfaState {
    if (skipsStaffMfa(config.SKIP_ADMIN_MFA, roles) || twoFactorOff) {
      return {
        totpEnabled: false,
        passkeyEnabled: false,
        mfaMandatory: false,
        mfaRequired: false,
      };
    }

    const passkeyEnabled = factors.passkeyCount > 0;

    return {
      totpEnabled: factors.totpEnabled,
      passkeyEnabled,
      mfaMandatory,
      mfaRequired: mfaMandatory || factors.totpEnabled || passkeyEnabled,
    };
  }

  /** Resolves which factors an account actually has enrolled. */
  async function resolveMfaState(
    userId: string,
    mfaMandatory: boolean,
    roles?: readonly string[] | null,
  ): Promise<MfaState> {
    if (skipsStaffMfa(config.SKIP_ADMIN_MFA, roles)) {
      return {
        totpEnabled: false,
        passkeyEnabled: false,
        mfaMandatory: false,
        mfaRequired: false,
      };
    }

    return buildMfaState(
      mfaMandatory,
      roles,
      await mfaRepository.findMfaFactorState(database, userId),
    );
  }

  /**
   * Reads roles, enrolled factors and the current session of the caller in
   * one parallel round trip. These used to run as four serial round trips
   * inside establishSession.
   */
  async function loadSessionPrerequisites(
    userId: string,
    existingSessionToken?: string | null,
  ): Promise<SessionPrerequisites> {
    const existingTokenHash = existingSessionToken
      ? hashToken(existingSessionToken)
      : null;

    const [roles, factors, existingSession] = await Promise.all([
      userRepository.listUserRoleNames(database, userId),
      mfaRepository.findMfaFactorState(database, userId),
      existingTokenHash
        ? sessionRepository.findActiveSession(database, existingTokenHash)
        : undefined,
    ]);

    return {
      roles,
      totpEnabled: factors.totpEnabled,
      passkeyCount: factors.passkeyCount,
      existingTokenHash,
      existingSession: existingSession ?? null,
    };
  }

  async function userHasAnyMfaFactor(userId: string): Promise<boolean> {
    const state = await resolveMfaState(userId, false);
    return state.totpEnabled || state.passkeyEnabled;
  }

  async function establishSession(
    user: SessionUser,
    request: {
      ip: string;
      userAgent: string | null;
      existingSessionToken?: string | null;
      location?: SessionLocation | null;
    },
    /** Pass when already loaded for this user and request; read here otherwise. */
    prerequisites?: SessionPrerequisites,
    /** Set once the student has signed a device out to make room. */
    options?: { skipDeviceLimit?: boolean },
  ): Promise<EstablishedSession> {
    if (user.is_deleted) {
      throw new AppError(
        403,
        "ACCOUNT_DEACTIVATED",
        "This account has been deactivated.",
      );
    }

    // Team access added for this verified email becomes the person's now,
    // before roles load, so this very session carries it (and its
    // two-factor rule). Prerequisites read earlier are stale once it does.
    const claimed = await runSignInClaim(database, user);
    const { roles, existingTokenHash, existingSession, ...factors } =
      (claimed === 0 ? prerequisites : undefined) ??
      (await loadSessionPrerequisites(user.id, request.existingSessionToken));
    const mfa = buildMfaState(
      isMfaMandatoryAccount(Boolean(user.mfa_mandatory), roles, {
        skipStaffMfa: config.SKIP_ADMIN_MFA,
      }),
      roles,
      factors,
      isTwoFactorOffFor(roles),
    );

    // Stored within what the session list is allowed to return. A longer
    // user agent, or an address that is not an IP, made that list fail for
    // the account until the session expired.
    const ipAddress = isIP(request.ip) ? request.ip : null;
    const userAgent =
      request.userAgent?.slice(0, SESSION_USER_AGENT_MAX_LENGTH) ?? null;

    const token = generateRandomToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    const mfaVerified = !mfa.mfaRequired;

    // Check if the client supplied an active, unexpired session belonging to this same user
    if (
      existingTokenHash &&
      existingSession &&
      existingSession.user_id === user.id
    ) {
      // Reuse the existing session record and rotate its token with optimistic concurrency check
      const rotated = await sessionRepository.rotateSession(
        database,
        existingSession.id,
        {
          previousTokenHash: existingTokenHash,
          tokenHash,
          ipAddress,
          userAgent,
          mfaVerified,
          expiresAt,
        },
      );

      if (rotated) {
        return { token, sessionId: existingSession.id, mfa, roles };
      }
    }

    const sessionId = crypto.randomUUID();
    const newSession = {
      id: sessionId,
      userId: user.id,
      tokenHash,
      ipAddress,
      userAgent,
      location: request.location ?? null,
      mfaVerified,
      expiresAt,
    };

    // A new device for a student counts against the academy's limit; staff
    // and the shared test accounts (TEST_LOGIN_ACCOUNTS), which several
    // testers sign in to at once, are never limited, and a browser already
    // signed in (above) is no new device.
    const limit =
      options?.skipDeviceLimit ||
      isStaffAccount(roles) ||
      isTestLoginAccount(user.email)
        ? null
        : await platformSettings.maxDevicesPerStudent();
    if (limit === null) {
      await sessionRepository.insertSession(database, newSession);
      return { token, sessionId, mfa, roles };
    }

    const signInToken = await database.transaction().execute(async (trx) => {
      // Two sign-ins of the same student at once count one after the other.
      await sessionRepository.lockUserForSignIn(trx, user.id);
      const active = await sessionRepository.countActiveUserSessions(
        trx,
        user.id,
      );
      if (active < limit) {
        await sessionRepository.insertSession(trx, newSession);
        return null;
      }
      const pendingToken = generateRandomToken();
      await sessionRepository.insertPendingDeviceSignIn(trx, {
        id: crypto.randomUUID(),
        userId: user.id,
        tokenHash: hashToken(pendingToken),
        ipAddress,
        userAgent,
        location: request.location ?? null,
        expiresAt: new Date(Date.now() + PENDING_DEVICE_SIGN_IN_TTL_MS),
      });
      return pendingToken;
    });
    if (signInToken !== null) throw new DeviceLimitReachedError(signInToken);

    return { token, sessionId, mfa, roles };
  }

  async function findPendingSignIn(signInToken: string | undefined) {
    const pending = signInToken
      ? await sessionRepository.findPendingDeviceSignIn(
          database,
          hashToken(signInToken),
        )
      : undefined;
    if (!pending) {
      throw new AppError(
        401,
        "DEVICE_SIGN_IN_EXPIRED",
        "This sign-in has expired. Sign in again.",
      );
    }
    return pending;
  }

  /** The devices a waiting sign-in can make room on, and the limit. */
  async function getDeviceLimitChoice(signInToken: string | undefined) {
    const pending = await findPendingSignIn(signInToken);
    const [limit, sessions] = await Promise.all([
      platformSettings.maxDevicesPerStudent(),
      sessionRepository.listUserSessions(database, pending.user_id),
    ]);
    return { limit, sessions };
  }

  /**
   * Signs the student's chosen device out and lets the waiting sign-in in,
   * on the device and from the place it came from.
   */
  async function resolveDeviceLimit(
    signInToken: string | undefined,
    sessionId: string,
  ) {
    const pending = await findPendingSignIn(signInToken);
    await database.transaction().execute(async (trx) => {
      const revoked = await sessionRepository.revokeUserSession(
        trx,
        pending.user_id,
        sessionId,
      );
      if (!revoked) {
        throw new AppError(
          404,
          "SESSION_NOT_FOUND",
          "That device is no longer signed in. Choose another.",
        );
      }
      // Used once: a second try with the same cookie finds it gone.
      if (!(await sessionRepository.usePendingDeviceSignIn(trx, pending.id))) {
        throw new AppError(
          401,
          "DEVICE_SIGN_IN_EXPIRED",
          "This sign-in has expired. Sign in again.",
        );
      }
      await outbox.publish(trx, {
        type: "auth.session_revoked",
        version: 1,
        dedupeKey: `auth.session_revoked:${sessionId}`,
        occurredAt: new Date(),
        payload: { recipientUserId: pending.user_id, sessionId },
      });
    });

    const user = await userRepository.findUserById(database, pending.user_id);
    if (!user) {
      throw new AppError(
        403,
        "ACCOUNT_DEACTIVATED",
        "This account has been deactivated.",
      );
    }
    const session = await establishSession(
      user,
      {
        ip: pending.ip_address ?? "",
        userAgent: pending.user_agent,
        location: {
          city: pending.location_city,
          region: pending.location_region,
          country: pending.location_country,
        },
      },
      undefined,
      { skipDeviceLimit: true },
    );
    return { user: { ...user, roles: session.roles }, session };
  }

  async function completeMfaEnrolment(
    userId: string,
    sessionId: string,
  ): Promise<void> {
    await sessionRepository.markSessionMfaVerified(database, sessionId);
    await sessionRepository.revokeOtherUserSessions(
      database,
      userId,
      sessionId,
    );
  }

  async function logout(sessionId: string): Promise<void> {
    await sessionRepository.revokeSession(database, sessionId);
  }

  async function sendActiveSessionsVerificationCode(
    user: Pick<
      AuthenticatedRequestContext["user"],
      "id" | "email" | "emailVerified"
    >,
    ip: string,
  ): Promise<void> {
    if (!otpService) {
      throw new AppError(
        500,
        "OTP_SERVICE_UNAVAILABLE",
        "Active-session verification is unavailable.",
      );
    }
    if (!user.email || !user.emailVerified) {
      throw new AppError(
        409,
        "VERIFIED_EMAIL_REQUIRED",
        "Verify your email address before continuing.",
      );
    }

    await otpService.sendActiveSessionsVerificationOtp(user.email, {
      ip,
      userId: user.id,
    });
  }

  async function verifyActiveSessionsCode(
    user: Pick<
      AuthenticatedRequestContext["user"],
      "id" | "email" | "emailVerified"
    >,
    sessionId: string,
    code: string,
  ): Promise<{ verifiedUntil: string }> {
    if (!otpService) {
      throw new AppError(
        500,
        "OTP_SERVICE_UNAVAILABLE",
        "Active-session verification is unavailable.",
      );
    }
    if (!user.email || !user.emailVerified) {
      throw new AppError(
        409,
        "VERIFIED_EMAIL_REQUIRED",
        "Verify your email address before continuing.",
      );
    }

    await otpService.verifyActiveSessionsVerificationOtp(user.email, code);

    const verifiedAt = new Date();
    const marked = await sessionRepository.markActiveSessionsVerified(
      database,
      user.id,
      sessionId,
      verifiedAt,
    );
    if (!marked) {
      throw new AppError(
        401,
        "SESSION_EXPIRED",
        "Your sign-in session has ended. Please sign in again.",
      );
    }

    return {
      verifiedUntil: new Date(
        verifiedAt.getTime() + ACTIVE_SESSIONS_VERIFICATION_TTL_MS,
      ).toISOString(),
    };
  }

  async function assertActiveSessionsVerified(
    userId: string,
    sessionId: string,
  ): Promise<void> {
    const now = new Date();
    const isVerified = await sessionRepository.hasActiveSessionsVerification(
      database,
      userId,
      sessionId,
      new Date(now.getTime() - ACTIVE_SESSIONS_VERIFICATION_TTL_MS),
      now,
    );
    if (!isVerified) {
      throw new AppError(
        403,
        "ACTIVE_SESSIONS_VERIFICATION_REQUIRED",
        "Verify your identity before viewing or managing active sessions.",
      );
    }
  }

  async function listSessions(userId: string, currentSessionId: string) {
    await assertActiveSessionsVerified(userId, currentSessionId);
    return sessionRepository.listUserSessions(database, userId);
  }

  async function revokeSession(
    userId: string,
    sessionId: string,
    currentSessionId: string,
  ): Promise<void> {
    await assertActiveSessionsVerified(userId, currentSessionId);
    await database.transaction().execute(async (trx) => {
      const revoked = await sessionRepository.revokeUserSession(
        trx,
        userId,
        sessionId,
      );
      if (!revoked) return;
      await outbox.publish(trx, {
        type: "auth.session_revoked",
        version: 1,
        dedupeKey: `auth.session_revoked:${sessionId}`,
        occurredAt: new Date(),
        payload: { recipientUserId: userId, sessionId },
      });
    });
  }

  async function revokeOtherSessions(
    userId: string,
    currentSessionId: string,
  ): Promise<void> {
    await assertActiveSessionsVerified(userId, currentSessionId);
    await sessionRepository.revokeOtherUserSessions(
      database,
      userId,
      currentSessionId,
    );
  }

  async function revokeAllSessions(
    userId: string,
    executor: Executor = database,
  ): Promise<void> {
    await sessionRepository.deleteAllUserSessions(executor, userId);
  }

  async function purgeOldSessions(cutoffDays = 30): Promise<number> {
    const cutoffDate = new Date(Date.now() - cutoffDays * 24 * 60 * 60 * 1000);
    return sessionRepository.purgeOldSessions(database, cutoffDate);
  }

  async function authenticate(
    token: string,
  ): Promise<AuthenticatedRequestContext | null> {
    const tokenHash = hashToken(token);

    // Every authenticated request needs this; it is cached per token (see
    // shared/session-auth-cache.ts for when it is cleared).
    return await getAuthContext(tokenHash, () => loadAuthContext(tokenHash));
  }

  async function loadAuthContext(
    tokenHash: string,
  ): Promise<AuthenticatedRequestContext | null> {
    const session = await sessionRepository.findActiveSession(
      database,
      tokenHash,
    );
    if (!session) {
      return null;
    }

    // The session row carries the user id, so the user, role and factor
    // reads need nothing from each other: one parallel round trip instead of
    // a serial user read followed by a second batch.
    const [user, roles, { totpEnabled, passkeyCount }] = await Promise.all([
      userRepository.findUserById(database, session.user_id),
      userRepository.listUserRoleNames(database, session.user_id),
      mfaRepository.findMfaFactorState(database, session.user_id),
    ]);
    if (!user) {
      return null;
    }

    // Staff skipped by configuration (SKIP_ADMIN_MFA), or a student, who
    // has no two-factor sign-in: a session waiting for its second step
    // counts as complete.
    const skipMfa = Boolean(
      skipsStaffMfa(config.SKIP_ADMIN_MFA, roles) || isTwoFactorOffFor(roles),
    );

    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    if (session.last_used_at < fifteenMinutesAgo) {
      await sessionRepository.touchSession(database, session.id, new Date());
    }

    const context: AuthenticatedRequestContext = {
      user: {
        ...toUserProfileFields(user),
        name: user.display_name,
        roles,
        totpEnabled: skipMfa ? false : totpEnabled,
        passkeyEnabled: skipMfa ? false : passkeyCount > 0,
        mfaMandatory: skipMfa
          ? false
          : isMfaMandatoryAccount(Boolean(user.mfa_mandatory), roles),
      },
      session: {
        id: session.id,
        user_id: session.user_id,
        token_hash: session.token_hash,
        mfa_verified: skipMfa ? true : session.mfa_verified,
        revoked_at: session.revoked_at,
        expires_at: session.expires_at,
      },
    };

    return context;
  }

  return {
    resolveMfaState,
    userHasAnyMfaFactor,
    /**
     * Drops every cached sign-in answer, after a change to the rules they
     * were worked out under (the academy's security settings).
     */
    forgetCachedAuthContexts: clearSessionAuthCache,
    loadSessionPrerequisites,
    establishSession,
    getDeviceLimitChoice,
    resolveDeviceLimit,
    completeMfaEnrolment,
    logout,
    sendActiveSessionsVerificationCode,
    verifyActiveSessionsCode,
    listSessions,
    revokeSession,
    revokeOtherSessions,
    revokeAllSessions,
    purgeOldSessions,
    authenticate,
  };
}

export type SessionService = ReturnType<typeof createSessionService>;
