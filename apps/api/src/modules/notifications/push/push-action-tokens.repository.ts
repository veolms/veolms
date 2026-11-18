import type {
  Database,
  DatabaseExecutor as Executor,
  PushActionRevokedReason,
  PushActionScope,
} from "@veolms/database";
import { sql, type Transaction } from "kysely";

/**
 * push_action_tokens: the single-use tokens in chat pushes to phones (see
 * the migration and push-action-tokens.service.ts). Only the hash is kept.
 */

export interface PushActionTokenRow {
  id: string;
  user_id: string;
  push_device_id: string;
  session_id: string;
  room_id: string;
  seq: number;
  stale_from_seq: number;
  scopes: PushActionScope[];
  expires_at: Date;
  used_at: Date | null;
  used_client_id: string | null;
  revoked_at: Date | null;
}

const ROW_COLUMNS = [
  "id",
  "user_id",
  "push_device_id",
  "session_id",
  "room_id",
  "seq",
  "stale_from_seq",
  "scopes",
  "expires_at",
  "used_at",
  "used_client_id",
  "revoked_at",
] as const;

export async function insertToken(
  database: Executor,
  input: {
    tokenHash: string;
    userId: string;
    deviceId: string;
    sessionId: string;
    roomId: string;
    seq: number;
    staleFromSeq: number;
    scopes: PushActionScope[];
    expiresAt: Date;
  },
): Promise<string> {
  const row = await database
    .insertInto("push_action_tokens")
    .values({
      token_hash: input.tokenHash,
      user_id: input.userId,
      push_device_id: input.deviceId,
      session_id: input.sessionId,
      room_id: input.roomId,
      seq: input.seq,
      stale_from_seq: input.staleFromSeq,
      scopes: input.scopes,
      expires_at: input.expiresAt,
      used_at: null,
      used_client_id: null,
      revoked_at: null,
      revoked_reason: null,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

/**
 * Revokes the phone's active tokens for the chat issued for an older
 * message (`seq` below `belowSeq`), or up to and including `uptoSeq`, except
 * `exceptId`. An older retry never revokes a newer token.
 */
export async function revokeDeviceRoomTokens(
  database: Executor,
  input: {
    deviceId: string;
    roomId: string;
    belowSeq?: number;
    uptoSeq?: number;
    exceptId: string;
    reason: PushActionRevokedReason;
    now: Date;
  },
): Promise<void> {
  let query = database
    .updateTable("push_action_tokens")
    .set({ revoked_at: input.now, revoked_reason: input.reason })
    .where("push_device_id", "=", input.deviceId)
    .where("room_id", "=", input.roomId)
    .where("id", "!=", input.exceptId)
    .where("used_at", "is", null)
    .where("revoked_at", "is", null);
  if (input.belowSeq !== undefined) {
    query = query.where("seq", "<", String(input.belowSeq));
  }
  if (input.uptoSeq !== undefined) {
    query = query.where("seq", "<=", String(input.uptoSeq));
  }
  await query.execute();
}

/** The token, locked for the rest of the transaction. */
export async function findTokenForUpdate(
  database: Transaction<Database>,
  tokenHash: string,
): Promise<PushActionTokenRow | undefined> {
  const row = await database
    .selectFrom("push_action_tokens")
    .select(ROW_COLUMNS)
    .where("token_hash", "=", tokenHash)
    .forUpdate()
    .executeTakeFirst();
  return row
    ? {
        ...row,
        seq: Number(row.seq),
        stale_from_seq: Number(row.stale_from_seq),
      }
    : undefined;
}

/** Who a token belongs to, without locking (for rate limits). */
export async function findTokenUserId(
  database: Executor,
  tokenHash: string,
): Promise<string | null> {
  const row = await database
    .selectFrom("push_action_tokens")
    .select("user_id")
    .where("token_hash", "=", tokenHash)
    .executeTakeFirst();
  return row?.user_id ?? null;
}

export async function markTokenUsed(
  database: Executor,
  input: { id: string; clientId: string | null; now: Date },
): Promise<void> {
  await database
    .updateTable("push_action_tokens")
    .set({ used_at: input.now, used_client_id: input.clientId })
    .where("id", "=", input.id)
    .execute();
}

/** Undoes `markTokenUsed` when the action itself was refused. */
export async function unmarkTokenUsed(
  database: Executor,
  input: { id: string; clientId: string | null },
): Promise<void> {
  let query = database
    .updateTable("push_action_tokens")
    .set({ used_at: null, used_client_id: null })
    .where("id", "=", input.id)
    .where("revoked_at", "is", null);
  query =
    input.clientId === null
      ? query.where("used_client_id", "is", null)
      : query.where("used_client_id", "=", input.clientId);
  await query.execute();
}

/**
 * The chat was read up to `readSeq` somewhere: revokes the user's active
 * tokens in it that this makes stale, and returns the phones that held
 * them (they may still show the chat's notification).
 */
export async function revokeReadTokens(
  database: Executor,
  reads: ReadonlyArray<{ userId: string; roomId: string; readSeq: number }>,
  now: Date,
): Promise<{ user_id: string; room_id: string; push_device_id: string }[]> {
  if (reads.length === 0) return [];
  const values = sql.join(
    reads.map(
      (read) =>
        sql`(${read.userId}::uuid, ${read.roomId}::uuid, ${read.readSeq}::bigint)`,
    ),
  );
  const result = await sql<{
    user_id: string;
    room_id: string;
    push_device_id: string;
  }>`
    update push_action_tokens t
    set revoked_at = ${now}, revoked_reason = 'read'
    from (values ${values}) as r(user_id, room_id, read_seq)
    where t.user_id = r.user_id
      and t.room_id = r.room_id
      and t.stale_from_seq <= r.read_seq
      and t.used_at is null
      and t.revoked_at is null
    returning t.user_id, t.room_id, t.push_device_id
  `.execute(database);
  return result.rows;
}

/** Rows expired, used or revoked before `before`. */
export async function deleteOldTokens(
  database: Executor,
  before: Date,
): Promise<number> {
  const result = await database
    .deleteFrom("push_action_tokens")
    .where((eb) =>
      eb.or([
        eb("expires_at", "<", before),
        eb("used_at", "<", before),
        eb("revoked_at", "<", before),
      ]),
    )
    .executeTakeFirst();
  return Number(result.numDeletedRows);
}
