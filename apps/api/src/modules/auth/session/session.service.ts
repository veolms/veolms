import crypto from "node:crypto";

import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";

import { SESSION_TTL_MS } from "../shared/auth.constants.ts";
import type {
  AuthenticatedRequestContext,
  EstablishedSession,
  MfaState,
  SessionUser,
} from "../shared/auth.types.ts";
import * as mfaRepository from "../mfa/mfa.repository.ts";
import * as sessionRepository from "./session.repository.ts";
import * as userRepository from "../authentication/authentication.repository.ts";
import { generateRandomToken, hashToken } from "../shared/auth.utils.ts";
import { createOutboxService } from "../../../events/outbox.service.ts";

export interface SessionServiceOptions {
  database: Kysely<Database>;
}

export function createSessionService({ database }: SessionServiceOptions) {
  const outbox = createOutboxService();
  /** Resolves which factors an account actually has enrolled. */
  async function resolveMfaState(
    userId: string,
    mfaMandatory: boolean,
  ): Promise<MfaState> {
    const [totpEnabled, passkeyCount] = await Promise.all([
      mfaRepository.isTotpEnabled(database, userId),
      mfaRepository.countUserPasskeys(database, userId),
    ]);

    const passkeyEnabled = passkeyCount > 0;

    return {
      totpEnabled,
      passkeyEnabled,
      mfaMandatory,
      mfaRequired: mfaMandatory || totpEnabled || passkeyEnabled,
    };
  }

  async function userHasAnyMfaFactor(userId: string): Promise<boolean> {
    const state = await resolveMfaState(userId, false);
    return state.totpEnabled || state.passkeyEnabled;
  }

  async function establishSession(
    user: SessionUser,
    request: { ip: string; userAgent: string | null },
  ): Promise<EstablishedSession> {
    const mfa = await resolveMfaState(user.id, Boolean(user.mfa_mandatory));

    const token = generateRandomToken();
    const sessionId = crypto.randomUUID();

    await sessionRepository.insertSession(database, {
      id: sessionId,
      userId: user.id,
      tokenHash: hashToken(token),
      ipAddress: request.ip,
      userAgent: request.userAgent,
      mfaVerified: !mfa.mfaRequired,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    });

    return { token, sessionId, mfa };
  }

  async function completeMfaEnrolment(
    userId: string,
    sessionId: string,
  ): Promise<void> {
    await sessionRepository.markSessionMfaVerified(database, sessionId);
    await sessionRepository.deleteOtherUserSessions(
      database,
      userId,
      sessionId,
    );
  }

  async function logout(sessionId: string): Promise<void> {
    await sessionRepository.deleteSession(database, sessionId);
  }

  async function listSessions(userId: string) {
    return sessionRepository.listUserSessions(database, userId);
  }

  async function revokeSession(
    userId: string,
    sessionId: string,
  ): Promise<void> {
    await database.transaction().execute(async (trx) => {
      const revoked = await sessionRepository.deleteUserSession(
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
    await sessionRepository.deleteOtherUserSessions(
      database,
      userId,
      currentSessionId,
    );
  }

  async function authenticate(
    token: string,
  ): Promise<AuthenticatedRequestContext | null> {
    const session = await sessionRepository.findActiveSession(
      database,
      hashToken(token),
    );
    if (!session) {
      return null;
    }

    const user = await userRepository.findUserById(database, session.user_id);
    if (!user) {
      return null;
    }

    const [totpEnabled, roles, permissions, passkeyCount] = await Promise.all([
      mfaRepository.isTotpEnabled(database, user.id),
      userRepository.listUserRoleNames(database, user.id),
      userRepository.listUserPermissions(database, user.id),
      mfaRepository.countUserPasskeys(database, user.id),
    ]);

    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    if (session.last_used_at < fifteenMinutesAgo) {
      await sessionRepository.touchSession(database, session.id, new Date());
    }

    return {
      user: {
        id: user.id,
        username: user.username,
        name: user.display_name,
        displayName: user.display_name,
        email: user.email,
        phoneNo: user.phone_no,
        roles,
        permissions,
        totpEnabled,
        passkeyEnabled: passkeyCount > 0,
        mfaMandatory: Boolean(user.mfa_mandatory),
      },
      session: {
        id: session.id,
        user_id: session.user_id,
        token_hash: session.token_hash,
        mfa_verified: session.mfa_verified,
        revoked_at: session.revoked_at,
        expires_at: session.expires_at,
      },
    };
  }

  return {
    resolveMfaState,
    userHasAnyMfaFactor,
    establishSession,
    completeMfaEnrolment,
    logout,
    listSessions,
    revokeSession,
    revokeOtherSessions,
    authenticate,
  };
}

export type SessionService = ReturnType<typeof createSessionService>;
