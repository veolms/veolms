import type { Executor } from "../shared/repository.types.ts";

export async function insertSession(
  database: Executor,
  input: {
    id: string;
    userId: string;
    tokenHash: string;
    ipAddress: string | null;
    userAgent: string | null;
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
      "created_at",
      "last_used_at",
      "expires_at",
    ])
    .where("user_id", "=", userId)
    .where("revoked_at", "is", null)
    .where("expires_at", ">", now)
    .orderBy("last_used_at", "desc")
    .execute();
}

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
      mfa_verified: input.mfaVerified,
      expires_at: input.expiresAt,
      last_used_at: now,
    })
    .where("id", "=", sessionId)
    .where("token_hash", "=", input.previousTokenHash)
    .where("revoked_at", "is", null)
    .where("expires_at", ">", now)
    .executeTakeFirst();

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
