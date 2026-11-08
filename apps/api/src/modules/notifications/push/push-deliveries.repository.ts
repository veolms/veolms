import crypto from "node:crypto";

import type {
  Database,
  DatabaseExecutor,
  Json,
  PushDeliverySource,
  PushDeliveryTable,
} from "@veolms/database";
import { sql, type Kysely, type Selectable } from "kysely";

export type ClaimedPushDelivery = Selectable<PushDeliveryTable>;

export interface NewPushDelivery {
  userId: string;
  source: PushDeliverySource;
  notificationId: string | null;
  dedupeKey: string;
  payload: Json;
  expiresAt: Date;
}

/** Queues pushes; one already queued under the same key is kept as it is. */
export async function insertPushDeliveries(
  database: DatabaseExecutor,
  deliveries: readonly NewPushDelivery[],
): Promise<void> {
  for (let i = 0; i < deliveries.length; i += 500) {
    const chunk = deliveries.slice(i, i + 500);
    if (chunk.length === 0) continue;
    await database
      .insertInto("push_deliveries")
      .values(
        chunk.map((delivery) => ({
          id: crypto.randomUUID(),
          user_id: delivery.userId,
          source: delivery.source,
          notification_id: delivery.notificationId,
          dedupe_key: delivery.dedupeKey,
          payload: delivery.payload,
          pending_device_ids: null,
          locked_until: null,
          last_error: null,
          sent_at: null,
          expires_at: delivery.expiresAt,
        })),
      )
      .onConflict((conflict) => conflict.column("dedupe_key").doNothing())
      .execute();
  }
}

/**
 * Claims due pushes (FOR UPDATE SKIP LOCKED + a lease), as the email queue
 * does: any number of workers on any number of servers share the queue,
 * and attempts count at claim time so a crash still uses one up.
 */
export async function claimPushDeliveries(
  database: Kysely<Database>,
  input: { limit: number; leaseUntil: Date; now: Date; maxAttempts: number },
): Promise<ClaimedPushDelivery[]> {
  return await database.transaction().execute(async (transaction) => {
    const rows = await transaction
      .selectFrom("push_deliveries")
      .selectAll()
      .where((eb) =>
        eb.or([
          eb.and([
            eb("status", "=", "pending"),
            eb("next_attempt_at", "<=", input.now),
          ]),
          eb.and([
            eb("status", "=", "processing"),
            eb("locked_until", "<", input.now),
          ]),
        ]),
      )
      .where("attempt_count", "<", input.maxAttempts)
      .orderBy("next_attempt_at", "asc")
      .orderBy("created_at", "asc")
      .forUpdate()
      .skipLocked()
      .limit(input.limit)
      .execute();

    if (rows.length === 0) return [];

    await transaction
      .updateTable("push_deliveries")
      .set((eb) => ({
        status: "processing" as const,
        locked_until: input.leaseUntil,
        updated_at: input.now,
        attempt_count: eb("attempt_count", "+", 1),
      }))
      .where(
        "id",
        "in",
        rows.map((row) => row.id),
      )
      .execute();

    return rows.map((row) => ({
      ...row,
      status: "processing" as const,
      locked_until: input.leaseUntil,
      updated_at: input.now,
      attempt_count: row.attempt_count + 1,
    }));
  });
}

/**
 * The marks below are fenced on the claim's lease: a worker that outlived
 * its lease cannot overwrite what the new owner decided.
 */
export async function finishPushDelivery(
  database: DatabaseExecutor,
  input: {
    deliveryId: string;
    status: "sent" | "failed" | "skipped";
    pendingDeviceIds: readonly string[] | null;
    error: string | null;
    now: Date;
    lockedUntil: Date;
  },
): Promise<void> {
  await database
    .updateTable("push_deliveries")
    .set({
      status: input.status,
      pending_device_ids: input.pendingDeviceIds
        ? [...input.pendingDeviceIds]
        : null,
      last_error: input.error?.slice(0, 1000) ?? null,
      sent_at: input.status === "sent" ? input.now : null,
      locked_until: null,
      updated_at: input.now,
    })
    .where("id", "=", input.deliveryId)
    .where("status", "=", "processing")
    .where("locked_until", "=", input.lockedUntil)
    .execute();
}

export async function retryPushDelivery(
  database: DatabaseExecutor,
  input: {
    deliveryId: string;
    pendingDeviceIds: readonly string[];
    nextAttemptAt: Date;
    error: string;
    /** Give back the attempt (the fault was ours, not the send's). */
    refundAttempt: boolean;
    now: Date;
    lockedUntil: Date;
  },
): Promise<void> {
  await database
    .updateTable("push_deliveries")
    .set((eb) => ({
      status: "pending" as const,
      pending_device_ids: [...input.pendingDeviceIds],
      next_attempt_at: input.nextAttemptAt,
      last_error: input.error.slice(0, 1000),
      locked_until: null,
      updated_at: input.now,
      ...(input.refundAttempt
        ? {
            attempt_count: sql<number>`greatest(${eb.ref("attempt_count")} - 1, 0)`,
          }
        : {}),
    }))
    .where("id", "=", input.deliveryId)
    .where("status", "=", "processing")
    .where("locked_until", "=", input.lockedUntil)
    .execute();
}

/** Finished pushes older than `before`, and queued ones long expired. */
export async function cleanupPushDeliveries(
  database: DatabaseExecutor,
  before: Date,
): Promise<number> {
  const result = await database
    .deleteFrom("push_deliveries")
    .where((eb) =>
      eb.or([
        eb.and([
          eb("status", "in", ["sent", "failed", "skipped"]),
          eb("updated_at", "<", before),
        ]),
        eb("expires_at", "<", before),
      ]),
    )
    .executeTakeFirst();
  return Number(result.numDeletedRows);
}

/** Push-backlog gauge for the ops heartbeat. */
export async function getPushDeliveryBacklog(
  database: DatabaseExecutor,
): Promise<number> {
  const row = await database
    .selectFrom("push_deliveries")
    .select(sql<string>`count(*)`.as("n"))
    .where("status", "in", ["pending", "processing"])
    .executeTakeFirstOrThrow();
  return Number(row.n);
}
