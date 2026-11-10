import crypto from "node:crypto";
import { isIP } from "node:net";

import { withLocalCommit, type Database } from "@veolms/database";
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
import {
  formatSessionLocation,
  type SessionLocation,
} from "../shared/request-location.ts";
import { createPlatformSettingsService } from "../../platform/platform-settings.service.ts";
import type { OtpService } from "../otp/otp.service.ts";
import type {
  LearningProgressPlayback,
  LearningProgressPlaying,
} from "@veolms/contracts";

export interface SessionServiceOptions {
  database: Kysely<Database>;
  otpService?: OtpService;
}

/**
 * Sessions this process marked as used, and when. A session's "last used"
 * time is kept to within 15 minutes, so each process writes it at most once
 * per session per 15 minutes, even while the sign-in cache still holds the
 * older time.
 */
const touchedSessions = new Map<string, number>();
const SESSION_TOUCH_EVERY_MS = 15 * 60 * 1000;

/** Sessions waiting to be written, with the time each was used. */
const pendingTouches = new Map<string, Date>();
const SESSION_TOUCH_FLUSH_MS = 5_000;
let flushTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Records that a session was used, without making the request wait.
 *
 * The times are written together every 5 seconds in one statement with a
 * local commit (`withLocalCommit`): they only feed "last active" in the
 * sessions list. Load test 2026-11-05: one write per request (~160 ms each,
 * waiting for the replica and the disk) was the busiest query, and one
 * background write per session filled the database pool when many learners
 * came back at once. A batch takes one connection for a few milliseconds
 * however many sessions it holds. A failed batch is retried by later
 * requests after the interval.
 */
export function touchSessionInBackground(
  database: Kysely<Database>,
  sessionId: string,
  now: number = Date.now(),
): boolean {
  const last = touchedSessions.get(sessionId);
  if (last !== undefined && now - last < SESSION_TOUCH_EVERY_MS) return false;
  touchedSessions.set(sessionId, now);
  if (touchedSessions.size > 50_000) {
    for (const [id, at] of touchedSessions) {
      if (now - at >= SESSION_TOUCH_EVERY_MS) touchedSessions.delete(id);
    }
  }
  pendingTouches.set(sessionId, new Date(now));
  if (!flushTimer) {
    flushTimer = setInterval(() => {
      void flushSessionTouches(database);
    }, SESSION_TOUCH_FLUSH_MS);
    flushTimer.unref();
  }
  return true;
}

/** Writes the waiting session times in one statement; returns how many. */
export async function flushSessionTouches(
  database: Kysely<Database>,
): Promise<number> {
  if (pendingTouches.size === 0) return 0;
  const batch = [...pendingTouches];
  pendingTouches.clear();
  const usedAt = batch.reduce(
    (latest, [, at]) => (at > latest ? at : latest),
    batch[0]![1],
  );
  try {
    await withLocalCommit(database, (executor) =>
      sessionRepository.touchSessions(
        executor,
        batch.map(([id]) => id),
        usedAt,
      ),
    );
    return batch.length;
  } catch {
    for (const [id] of batch) touchedSessions.delete(id);
    return 0;
  }
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

export function maskDestination(
  channel: "email" | "phone",
  destination: string,
): string {
  if (channel === "phone") {
    const digits = destination.replace(/\D/g, "");
    const last4 = digits.slice(-4);
    return `••••${last4}`;
  }
  const at = destination.lastIndexOf("@");
  if (at < 1) return destination;
  const local = destination.slice(0, at);
  const domain = destination.slice(at);
  const visible = Math.min(2, Math.max(1, local.length - 1));
  return `${local.slice(0, visible)}••••${domain}`;
}

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
      isStaffAccount(roles) || isTestLoginAccount(user.email)
        ? null
        : await platformSettings.maxDevicesPerStudent();
    if (limit === null) {
      await sessionRepository.insertSession(database, newSession);
      return { token, sessionId, mfa, roles };
    }

    await database.transaction().execute(async (trx) => {
      // Two sign-ins of the same student at once count one after the other.
      await sessionRepository.lockUserForSignIn(trx, user.id);
      // At the limit, the newest sign-in always gets in: the devices used
      // longest ago are signed out to make room, without a notice. Each
      // finds itself signed out at its next request.
      await sessionRepository.revokeLeastRecentlyUsedSessions(
        trx,
        user.id,
        limit - 1,
      );
      await sessionRepository.insertSession(trx, newSession);
    });

    return { token, sessionId, mfa, roles };
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

  function resolveVerificationChannel(
    user: Pick<
      AuthenticatedRequestContext["user"],
      "id" | "email" | "emailVerified" | "phoneNo" | "mobileVerified"
    >,
    requestedChannel?: "email" | "phone",
  ): { channel: "email" | "phone"; destination: string } {
    const hasEmail = Boolean(user.email && user.emailVerified);
    const hasPhone = Boolean(user.phoneNo && user.mobileVerified);

    if (!hasEmail && !hasPhone) {
      throw new AppError(
        409,
        "NO_VERIFICATION_CHANNEL",
        "A verified email address or phone number is required to verify your active sessions.",
      );
    }

    if (requestedChannel === "phone") {
      if (!hasPhone) {
        throw new AppError(
          409,
          "VERIFIED_PHONE_REQUIRED",
          "A verified phone number is required.",
        );
      }
      return { channel: "phone", destination: user.phoneNo! };
    }

    if (requestedChannel === "email") {
      if (!hasEmail) {
        throw new AppError(
          409,
          "VERIFIED_EMAIL_REQUIRED",
          "A verified email address is required.",
        );
      }
      return { channel: "email", destination: user.email! };
    }

    if (hasEmail) {
      return { channel: "email", destination: user.email! };
    }

    return { channel: "phone", destination: user.phoneNo! };
  }

  async function sendActiveSessionsVerificationCode(
    user: Pick<
      AuthenticatedRequestContext["user"],
      "id" | "email" | "emailVerified" | "phoneNo" | "mobileVerified"
    >,
    ip: string,
    requestedChannel?: "email" | "phone",
  ): Promise<{
    channel: "email" | "phone";
    maskedDestination: string;
  }> {
    if (!otpService) {
      throw new AppError(
        500,
        "OTP_SERVICE_UNAVAILABLE",
        "Active-session verification is unavailable.",
      );
    }

    const { channel, destination } = resolveVerificationChannel(
      user,
      requestedChannel,
    );

    await otpService.sendActiveSessionsVerificationOtp(destination, channel, {
      ip,
      userId: user.id,
    });

    return {
      channel,
      maskedDestination: maskDestination(channel, destination),
    };
  }

  async function verifyActiveSessionsCode(
    user: Pick<
      AuthenticatedRequestContext["user"],
      "id" | "email" | "emailVerified" | "phoneNo" | "mobileVerified"
    >,
    sessionId: string,
    code: string,
    requestedChannel?: "email" | "phone",
  ): Promise<{ verifiedUntil: string }> {
    if (!otpService) {
      throw new AppError(
        500,
        "OTP_SERVICE_UNAVAILABLE",
        "Active-session verification is unavailable.",
      );
    }

    const { channel, destination } = resolveVerificationChannel(
      user,
      requestedChannel,
    );

    await otpService.verifyActiveSessionsVerificationOtp(
      destination,
      channel,
      code,
    );

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
      touchSessionInBackground(database, session.id);
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

  async function reportPlayback(
    user: { id: string; roles: readonly string[]; email?: string | null },
    sessionId: string,
    playing: LearningProgressPlaying | undefined,
  ): Promise<LearningProgressPlayback> {
    const limit =
      isStaffAccount(user.roles) || isTestLoginAccount(user.email)
        ? null
        : await platformSettings.maxSimultaneousStreams();

    if (limit === null) {
      return { allowed: true };
    }

    if (!playing) {
      await sessionRepository.clearPlaybackClaim(database, sessionId);
      return { allowed: true };
    }

    return await database.transaction().execute(async (trx) => {
      await sessionRepository.lockUserForSignIn(trx, user.id);
      const now = new Date();
      // Dynamic stale window: 2 * sync interval + 10s (130 s under default 60 s sync).
      const staleWindowMs =
        (2 * config.LEARNING_PROGRESS_SYNC_SECONDS + 10) * 1000;
      const since = new Date(now.getTime() - staleWindowMs);
      const live = await sessionRepository.listLivePlaybackClaims(
        trx,
        user.id,
        since,
        now,
      );

      const mine = live.find((s) => s.id === sessionId);
      // play event = user just pressed play => always the newest claim.
      // heartbeat with no live claim = own claim went stale (network drop,
      // throttled hidden tab, pagehide beacon closed the previous tab).
      // Rank it as epoch-zero so any device that actually pressed play wins.
      const claimedAt =
        playing.event === "play"
          ? now
          : (mine?.playing_claimed_at ?? new Date(0));
      const others = live.filter((s) => s.id !== sessionId);

      const allClaims: Array<{
        id: string;
        claimedAt: Date;
        claim?: sessionRepository.LivePlaybackClaim;
      }> = [
        ...others.map((o) => ({
          id: o.id,
          claimedAt: o.playing_claimed_at,
          claim: o,
        })),
        { id: sessionId, claimedAt },
      ];

      allClaims.sort((a, b) => {
        const diff = b.claimedAt.getTime() - a.claimedAt.getTime();
        if (diff !== 0) return diff;
        return a.id.localeCompare(b.id);
      });

      const allowed =
        allClaims.findIndex((item) => item.id === sessionId) < limit;

      if (allowed) {
        await sessionRepository.setPlaybackClaim(trx, sessionId, {
          lessonId: playing.lessonId,
          claimedAt,
          at: now,
        });
        return { allowed: true };
      }

      await sessionRepository.clearPlaybackClaim(trx, sessionId);
      const newest = allClaims[0]?.claim;
      return {
        allowed: false,
        playingOn: {
          userAgent: newest?.user_agent ?? null,
          location: newest ? formatSessionLocation(newest) : null,
          lessonTitle: newest?.lesson_title ?? null,
          since: (newest?.playing_claimed_at ?? now).toISOString(),
        },
      };
    });
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
    reportPlayback,
    /**
     * Of `sessionIds`, those signed out (logout, sign-out elsewhere,
     * password reset). Expired sessions are not: a login that ran out was
     * not a sign-out. Phone pushes stop for the signed-out ones.
     */
    listRevokedSessionIds: (sessionIds: readonly string[]) =>
      sessionRepository.listRevokedSessionIds(database, sessionIds),
  };
}

export type SessionService = ReturnType<typeof createSessionService>;
