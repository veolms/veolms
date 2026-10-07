import crypto from "node:crypto";

import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";

import { config } from "../../../config.ts";
import { AppError } from "../../../lib/errors.ts";
import { ADMIN_ROLE, SESSION_TTL_MS } from "../shared/auth.constants.ts";
import { isMfaMandatoryAccount } from "../shared/mfa-policy.ts";
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
  toUserProfileFields,
} from "../shared/auth.utils.ts";
import {
  getCachedAuthContext,
  setCachedAuthContext,
} from "../shared/session-auth-cache.ts";
import { createOutboxService } from "../../../events/outbox.service.ts";
import type { Executor } from "../shared/repository.types.ts";

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

  /** Same rules as resolveMfaState, for factor facts that are already loaded. */
  function buildMfaState(
    mfaMandatory: boolean,
    roles: readonly string[] | null | undefined,
    factors: { totpEnabled: boolean; passkeyCount: number },
  ): MfaState {
    const isAdmin = Boolean(
      roles?.some((role) => role.toLowerCase() === ADMIN_ROLE),
    );
    if (config.SKIP_ADMIN_MFA && isAdmin) {
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
    const isAdmin = Boolean(
      roles?.some((role) => role.toLowerCase() === ADMIN_ROLE),
    );
    if (config.SKIP_ADMIN_MFA && isAdmin) {
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

    const { roles, existingTokenHash, existingSession, ...factors } =
      prerequisites ??
      (await loadSessionPrerequisites(user.id, request.existingSessionToken));
    const mfa = buildMfaState(
      isMfaMandatoryAccount(Boolean(user.mfa_mandatory), roles, {
        skipAdminMfa: config.SKIP_ADMIN_MFA,
      }),
      roles,
      factors,
    );

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
          ipAddress: request.ip,
          userAgent: request.userAgent,
          mfaVerified,
          expiresAt,
        },
      );

      if (rotated) {
        return { token, sessionId: existingSession.id, mfa, roles };
      }
    }

    const sessionId = crypto.randomUUID();

    await sessionRepository.insertSession(database, {
      id: sessionId,
      userId: user.id,
      tokenHash,
      ipAddress: request.ip,
      userAgent: request.userAgent,
      mfaVerified,
      expiresAt,
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

    // Process-local short-TTL cache: this path runs 5 queries in 3 serial
    // round trips on EVERY authenticated request. Coherence (including
    // immediate in-process eviction on revocation/rotation/MFA changes) is
    // documented in shared/session-auth-cache.ts.
    const cached = getCachedAuthContext(
      tokenHash,
      config.SESSION_AUTH_CACHE_TTL_MS,
    );
    if (cached) {
      return cached;
    }

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

    const isAdmin = roles.some((role) => role.toLowerCase() === ADMIN_ROLE);
    const skipAdminMfa = Boolean(config.SKIP_ADMIN_MFA && isAdmin);

    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    if (session.last_used_at < fifteenMinutesAgo) {
      await sessionRepository.touchSession(database, session.id, new Date());
    }

    const context: AuthenticatedRequestContext = {
      user: {
        ...toUserProfileFields(user),
        name: user.display_name,
        roles,
        totpEnabled: skipAdminMfa ? false : totpEnabled,
        passkeyEnabled: skipAdminMfa ? false : passkeyCount > 0,
        mfaMandatory: skipAdminMfa
          ? false
          : isMfaMandatoryAccount(Boolean(user.mfa_mandatory), roles),
      },
      session: {
        id: session.id,
        user_id: session.user_id,
        token_hash: session.token_hash,
        mfa_verified: skipAdminMfa ? true : session.mfa_verified,
        revoked_at: session.revoked_at,
        expires_at: session.expires_at,
      },
    };

    setCachedAuthContext(tokenHash, context, config.SESSION_AUTH_CACHE_TTL_MS);
    return context;
  }

  return {
    resolveMfaState,
    userHasAnyMfaFactor,
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
