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

export async function deleteSession(
  database: Executor,
  sessionId: string,
): Promise<void> {
  await database.deleteFrom("sessions").where("id", "=", sessionId).execute();
}

/** Scoped by `user_id` so one user can never revoke another user's session. */
export async function deleteUserSession(
  database: Executor,
  userId: string,
  sessionId: string,
): Promise<boolean> {
  const result = await database
    .deleteFrom("sessions")
    .where("id", "=", sessionId)
    .where("user_id", "=", userId)
    .executeTakeFirst();
  return Number(result.numDeletedRows) > 0;
}

export async function deleteOtherUserSessions(
  database: Executor,
  userId: string,
  keepSessionId: string,
): Promise<void> {
  await database
    .deleteFrom("sessions")
    .where("user_id", "=", userId)
    .where("id", "!=", keepSessionId)
    .execute();
}

export async function deleteAllUserSessions(
  database: Executor,
  userId: string,
): Promise<void> {
  await database.deleteFrom("sessions").where("user_id", "=", userId).execute();
}

export function listUserSessions(database: Executor, userId: string) {
  return database
    .selectFrom("sessions")
    .select(["id", "ip_address", "user_agent", "created_at", "last_used_at"])
    .where("user_id", "=", userId)
    .orderBy("last_used_at", "desc")
    .execute();
}

export function findActiveSession(database: Executor, tokenHash: string) {
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
    .where("expires_at", ">", new Date())
    .where("revoked_at", "is", null)
    .executeTakeFirst();
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
