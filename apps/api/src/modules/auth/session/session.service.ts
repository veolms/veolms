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

export interface SessionServiceOptions {
  database: Kysely<Database>;
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

export function createSessionService({ database }: SessionServiceOptions) {
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

  async function listSessions(userId: string) {
    return sessionRepository.listUserSessions(database, userId);
  }

  async function revokeSession(
    userId: string,
    sessionId: string,
  ): Promise<void> {
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
    completeMfaEnrolment,
    logout,
    listSessions,
    revokeSession,
    revokeOtherSessions,
    revokeAllSessions,
    purgeOldSessions,
    authenticate,
  };
}

export type SessionService = ReturnType<typeof createSessionService>;
