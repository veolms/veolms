import type { SessionLocation } from "../shared/request-location.ts";
import type { Executor } from "../shared/repository.types.ts";
import {
  evictCachedSession,
  evictCachedUserSessions,
} from "../shared/session-auth-cache.ts";

// Every session mutation below evicts the process-local authentication
// cache so revocation / MFA state changes take effect immediately in this
// process no matter which feature performed the write (the MFA feature
// calls these functions directly, bypassing the session service). If a
// surrounding transaction later rolls back, the eviction was merely an
// unnecessary cache miss. A mutation committed on ANOTHER instance becomes
// visible there when the TTL expires — see session-auth-cache.ts.

export async function insertSession(
  database: Executor,
  input: {
    id: string;
    userId: string;
    tokenHash: string;
    ipAddress: string | null;
    userAgent: string | null;
    location?: SessionLocation | null;
    mfaVerified: boolean;
    expiresAt: Date;
  },
): Promise<void> {
  await database
    .insertInto("sessions")
    .values({
      id: input.id,
      user_id: input.userId,
      token_hash: input.tokenHash,
      ip_address: input.ipAddress,
      user_agent: input.userAgent,
      location_city: input.location?.city ?? null,
      location_region: input.location?.region ?? null,
      location_country: input.location?.country ?? null,
      mfa_verified: input.mfaVerified,
      expires_at: input.expiresAt,
    })
    .execute();
}

export async function markSessionMfaVerified(
  database: Executor,
  sessionId: string,
): Promise<void> {
  await database
    .updateTable("sessions")
    .set({ mfa_verified: true })
    .where("id", "=", sessionId)
    .execute();
  evictCachedSession(sessionId);
}

export async function revokeSession(
  database: Executor,
  sessionId: string,
  now: Date = new Date(),
): Promise<void> {
  await database
    .updateTable("sessions")
    .set({ revoked_at: now })
    .where("id", "=", sessionId)
    .where("revoked_at", "is", null)
    .execute();
  evictCachedSession(sessionId);
}

export async function deleteAllUserSessions(
  database: Executor,
  userId: string,
): Promise<void> {
  await database.deleteFrom("sessions").where("user_id", "=", userId).execute();
  evictCachedUserSessions(userId);
}

/** Scoped by `user_id` so one user can never revoke another user's session. */
export async function revokeUserSession(
  database: Executor,
  userId: string,
  sessionId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const result = await database
    .updateTable("sessions")
    .set({ revoked_at: now })
    .where("id", "=", sessionId)
    .where("user_id", "=", userId)
    .where("revoked_at", "is", null)
    .executeTakeFirst();
  evictCachedSession(sessionId);
  return Number(result.numUpdatedRows) > 0;
}

export async function revokeOtherUserSessions(
  database: Executor,
  userId: string,
  keepSessionId: string,
  now: Date = new Date(),
): Promise<void> {
  await database
    .updateTable("sessions")
    .set({ revoked_at: now })
    .where("user_id", "=", userId)
    .where("id", "!=", keepSessionId)
    .where("revoked_at", "is", null)
    .execute();
  evictCachedUserSessions(userId);
}

export function listUserSessions(
  database: Executor,
  userId: string,
  now: Date = new Date(),
) {
  return database
    .selectFrom("sessions")
    .select([
      "id",
      "ip_address",
      "user_agent",
      "location_city",
      "location_region",
      "location_country",
      "last_used_at",
    ])
    .where("user_id", "=", userId)
    .where("revoked_at", "is", null)
    .where("expires_at", ">", now)
    .orderBy("last_used_at", "desc")
    .execute();
}

export type ActiveSession = NonNullable<
  Awaited<ReturnType<typeof findActiveSession>>
>;

export function findActiveSession(
  database: Executor,
  tokenHash: string,
  now: Date = new Date(),
) {
  return database
    .selectFrom("sessions")
    .select([
      "id",
      "user_id",
      "token_hash",
      "mfa_verified",
      "revoked_at",
      "expires_at",
      "last_used_at",
    ])
    .where("token_hash", "=", tokenHash)
    .where("expires_at", ">", now)
    .where("revoked_at", "is", null)
    .executeTakeFirst();
}

export async function rotateSession(
  database: Executor,
  sessionId: string,
  input: {
    previousTokenHash: string;
    tokenHash: string;
    ipAddress: string | null;
    userAgent: string | null;
    location?: SessionLocation | null;
    mfaVerified: boolean;
    expiresAt: Date;
    now?: Date;
  },
): Promise<boolean> {
  const now = input.now ?? new Date();
  const result = await database
    .updateTable("sessions")
    .set({
      token_hash: input.tokenHash,
      ip_address: input.ipAddress,
      user_agent: input.userAgent,
      location_city: input.location?.city ?? null,
      location_region: input.location?.region ?? null,
      location_country: input.location?.country ?? null,
      mfa_verified: input.mfaVerified,
      expires_at: input.expiresAt,
      last_used_at: now,
    })
    .where("id", "=", sessionId)
    .where("token_hash", "=", input.previousTokenHash)
    .where("revoked_at", "is", null)
    .where("expires_at", ">", now)
    .executeTakeFirst();

  evictCachedSession(sessionId);
  return Number(result.numUpdatedRows) > 0;
}

export async function purgeOldSessions(
  database: Executor,
  cutoffDate: Date,
): Promise<number> {
  const result = await database
    .deleteFrom("sessions")
    .where((eb) =>
      eb.or([
        eb("revoked_at", "is not", null).and("revoked_at", "<", cutoffDate),
        eb("revoked_at", "is", null).and("expires_at", "<", cutoffDate),
      ]),
    )
    .executeTakeFirst();

  // Only sessions revoked or expired long ago are deleted, and neither is
  // ever served from the sign-in cache: nothing to clear.
  // Sign-ins that once waited on the device limit (none are added since
  // the limit signs the oldest device out instead) are kept no longer.
  await database
    .deleteFrom("pending_device_sign_ins")
    .where("expires_at", "<", cutoffDate)
    .execute();
  return Number(result.numDeletedRows);
}

export async function touchSession(
  database: Executor,
  sessionId: string,
  now: Date,
): Promise<void> {
  await database
    .updateTable("sessions")
    .set({ last_used_at: now })
    .where("id", "=", sessionId)
    .execute();
}

/**
 * Signs the user out of the sessions in use now (not signed out, not
 * expired) that were used longest ago, until `keep` are left; returns how
 * many it signed out.
 */
export async function revokeLeastRecentlyUsedSessions(
  database: Executor,
  userId: string,
  keep: number,
  now: Date = new Date(),
): Promise<number> {
  const revoked = await database
    .updateTable("sessions")
    .set({ revoked_at: now })
    .where("id", "in", (eb) =>
      eb
        .selectFrom("sessions")
        .select("id")
        .where("user_id", "=", userId)
        .where("revoked_at", "is", null)
        .where("expires_at", ">", now)
        .orderBy("last_used_at", "desc")
        .orderBy("created_at", "desc")
        .offset(keep),
    )
    .returning("id")
    .execute();
  for (const { id } of revoked) evictCachedSession(id);
  return revoked.length;
}

/**
 * Holds the user's row until the transaction ends, so two sign-ins of the
 * same person at once count their sessions one after the other.
 */
export async function lockUserForSignIn(
  database: Executor,
  userId: string,
): Promise<void> {
  await database
    .selectFrom("users")
    .select("id")
    .where("id", "=", userId)
    .forUpdate()
    .executeTakeFirst();
}
