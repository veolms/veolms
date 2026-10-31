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
  // Sign-ins that waited on the device limit are kept no longer.
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

/** The user's sessions in use now (not signed out, not expired). */
export async function countActiveUserSessions(
  database: Executor,
  userId: string,
  now: Date = new Date(),
): Promise<number> {
  const row = await database
    .selectFrom("sessions")
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .where("user_id", "=", userId)
    .where("revoked_at", "is", null)
    .where("expires_at", ">", now)
    .executeTakeFirst();
  return Number(row?.count ?? 0);
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

export async function insertPendingDeviceSignIn(
  database: Executor,
  input: {
    id: string;
    userId: string;
    tokenHash: string;
    ipAddress: string | null;
    userAgent: string | null;
    location?: SessionLocation | null;
    expiresAt: Date;
  },
): Promise<void> {
  await database
    .insertInto("pending_device_sign_ins")
    .values({
      id: input.id,
      user_id: input.userId,
      token_hash: input.tokenHash,
      ip_address: input.ipAddress,
      user_agent: input.userAgent,
      location_city: input.location?.city ?? null,
      location_region: input.location?.region ?? null,
      location_country: input.location?.country ?? null,
      expires_at: input.expiresAt,
    })
    .execute();
}

/** A sign-in still waiting on the device limit: not used, not expired. */
export function findPendingDeviceSignIn(
  database: Executor,
  tokenHash: string,
  now: Date = new Date(),
) {
  return database
    .selectFrom("pending_device_sign_ins")
    .selectAll()
    .where("token_hash", "=", tokenHash)
    .where("used_at", "is", null)
    .where("expires_at", ">", now)
    .executeTakeFirst();
}

/** Marks it used; false when it already was (it can be used once only). */
export async function usePendingDeviceSignIn(
  database: Executor,
  id: string,
  now: Date = new Date(),
): Promise<boolean> {
  const result = await database
    .updateTable("pending_device_sign_ins")
    .set({ used_at: now })
    .where("id", "=", id)
    .where("used_at", "is", null)
    .where("expires_at", ">", now)
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

/** Shape returned by listLivePlaybackClaims. */
export interface LivePlaybackClaim {
  id: string;
  user_agent: string | null;
  location_city: string | null;
  location_region: string | null;
  location_country: string | null;
  playing_lesson_id: string | null;
  lesson_title: string | null;
  playing_claimed_at: Date;
  playing_at: Date;
}

/**
 * All sessions for this user that have an active, non-stale playback claim.
 * "Active" means not revoked, not expired. "Non-stale" means `playing_at`
 * is more recent than `since`. Left-joined to `course_lessons` for the
 * lesson title (informational only).
 */
export async function listLivePlaybackClaims(
  database: Executor,
  userId: string,
  since: Date,
  now: Date = new Date(),
): Promise<LivePlaybackClaim[]> {
  const rows = await database
    .selectFrom("sessions")
    .leftJoin(
      "course_lessons",
      "course_lessons.id",
      "sessions.playing_lesson_id",
    )
    .select([
      "sessions.id",
      "sessions.user_agent",
      "sessions.location_city",
      "sessions.location_region",
      "sessions.location_country",
      "sessions.playing_lesson_id",
      "sessions.playing_claimed_at",
      "sessions.playing_at",
      "course_lessons.title as lesson_title",
    ])
    .where("sessions.user_id", "=", userId)
    .where("sessions.revoked_at", "is", null)
    .where("sessions.expires_at", ">", now)
    .where("sessions.playing_at", ">", since)
    .execute();

  // Filter out any rows where playing_claimed_at or playing_at is null
  // (type narrowing: the WHERE clause guarantees playing_at is not null,
  // but claimed_at could theoretically be null on very old data).
  return rows.filter(
    (r): r is LivePlaybackClaim =>
      r.playing_claimed_at !== null && r.playing_at !== null,
  );
}

/**
 * Records or updates this session's playback claim.
 * `claimedAt` is when play was pressed (used for "newest wins" ordering).
 * `at` is the current time (the heartbeat timestamp).
 */
export async function setPlaybackClaim(
  database: Executor,
  sessionId: string,
  claim: { lessonId: string; claimedAt: Date; at: Date },
): Promise<void> {
  await database
    .updateTable("sessions")
    .set({
      playing_lesson_id: claim.lessonId,
      playing_claimed_at: claim.claimedAt,
      playing_at: claim.at,
    })
    .where("id", "=", sessionId)
    .execute();
}

/**
 * Clears this session's playback claim. Called when:
 * - The batch is sent without `playing` (nothing is playing).
 * - This session lost the "newest wins" race and must not keep counting.
 */
export async function clearPlaybackClaim(
  database: Executor,
  sessionId: string,
): Promise<void> {
  await database
    .updateTable("sessions")
    .set({
      playing_lesson_id: null,
      playing_claimed_at: null,
      playing_at: null,
    })
    .where("id", "=", sessionId)
    .execute();
}
