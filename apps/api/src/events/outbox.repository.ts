import crypto from "node:crypto";

import type {
  Database,
  DatabaseExecutor,
  Json,
  OutboxEventTable,
} from "@veolms/database";
import type { Kysely, Selectable, Transaction } from "kysely";

import type { DomainEvent } from "./domain-event.types.ts";

export type ClaimedOutboxEvent = Selectable<OutboxEventTable>;

export async function createEvent(
  transaction: Transaction<Database>,
  event: DomainEvent,
): Promise<void> {
  await transaction
    .insertInto("outbox_events")
    .values({
      id: crypto.randomUUID(),
      event_type: event.type,
      event_version: event.version,
      dedupe_key: event.dedupeKey,
      payload: event.payload as Json,
      occurred_at: event.occurredAt,
      processed_at: null,
      locked_until: null,
      last_error: null,
    })
    .onConflict((conflict) => conflict.column("dedupe_key").doNothing())
    .execute();
}

export async function claimBatch(
  database: Kysely<Database>,
  input: { limit: number; leaseUntil: Date; now: Date; maxAttempts: number },
): Promise<ClaimedOutboxEvent[]> {
  return await database.transaction().execute(async (transaction) => {
    const rows = await transaction
      .selectFrom("outbox_events")
      .selectAll()
      .where((expression) =>
        expression.or([
          expression.and([
            expression("status", "=", "pending"),
            expression("available_at", "<=", input.now),
          ]),
          expression.and([
            expression("status", "=", "processing"),
            expression("locked_until", "<", input.now),
          ]),
        ]),
      )
      // attempt_count now increments AT CLAIM TIME (below), so an event
      // that crashes the worker mid-processing — never reaching markRetry/
      // markFailed — still burns attempts and stops being claimed here
      // once it exhausts them, instead of crash-looping forever.
      .where("attempt_count", "<", input.maxAttempts)
      .orderBy("available_at", "asc")
      .orderBy("created_at", "asc")
      .forUpdate()
      .skipLocked()
      .limit(input.limit)
      .execute();

    if (rows.length === 0) return [];

    await transaction
      .updateTable("outbox_events")
      .set((eb) => ({
        status: "processing" as const,
        locked_until: input.leaseUntil,
        last_error: null,
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
      last_error: null,
      attempt_count: row.attempt_count + 1,
    }));
  });
}

/**
 * The `lockedUntil` argument on the mark functions below is a FENCE: each
 * update only applies while this worker still owns the lease it was given
 * at claim time. If processing outlived the lease and another worker
 * re-claimed the event (writing a strictly later locked_until), the late
 * worker's mark becomes a no-op instead of clobbering the new owner's
 * state — previously a slow fan-out could markProcessed an event another
 * worker was mid-way through, or re-send its emails.
 */

export async function markProcessed(
  database: DatabaseExecutor,
  eventId: string,
  now: Date,
  lockedUntil: Date,
): Promise<void> {
  await database
    .updateTable("outbox_events")
    .set({
      status: "processed",
      processed_at: now,
      locked_until: null,
      last_error: null,
    })
    .where("id", "=", eventId)
    .where("status", "=", "processing")
    .where("locked_until", "=", lockedUntil)
    .execute();
}

export async function markRetry(
  database: DatabaseExecutor,
  input: {
    eventId: string;
    availableAt: Date;
    error: string;
    lockedUntil: Date;
  },
): Promise<void> {
  await database
    .updateTable("outbox_events")
    .set({
      status: "pending",
      available_at: input.availableAt,
      locked_until: null,
      last_error: input.error,
    })
    .where("id", "=", input.eventId)
    .where("status", "=", "processing")
    .where("locked_until", "=", input.lockedUntil)
    .execute();
}

export async function markFailed(
  database: DatabaseExecutor,
  input: { eventId: string; error: string; lockedUntil: Date },
): Promise<void> {
  await database
    .updateTable("outbox_events")
    .set({
      status: "failed",
      locked_until: null,
      last_error: input.error,
    })
    .where("id", "=", input.eventId)
    .where("status", "=", "processing")
    .where("locked_until", "=", input.lockedUntil)
    .execute();
}

/** Queue-depth gauges for the ops heartbeat. */
export async function getOutboxDepth(
  database: DatabaseExecutor,
): Promise<{ pending: number; processing: number; failed: number }> {
  const rows = await database
    .selectFrom("outbox_events")
    .select(["status", (eb) => eb.fn.count<number>("id").as("total")])
    .where("status", "in", ["pending", "processing", "failed"])
    .groupBy("status")
    .execute();
  const byStatus = new Map(rows.map((row) => [row.status, Number(row.total)]));
  return {
    pending: byStatus.get("pending") ?? 0,
    processing: byStatus.get("processing") ?? 0,
    failed: byStatus.get("failed") ?? 0,
  };
}

export async function cleanupProcessed(
  database: DatabaseExecutor,
  olderThan: Date,
): Promise<number> {
  const result = await database
    .deleteFrom("outbox_events")
    .where("status", "=", "processed")
    .where("processed_at", "<", olderThan)
    .executeTakeFirst();
  return Number(result.numDeletedRows);
}
