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
  input: { limit: number; leaseUntil: Date; now: Date },
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
      .orderBy("available_at", "asc")
      .orderBy("created_at", "asc")
      .forUpdate()
      .skipLocked()
      .limit(input.limit)
      .execute();

    if (rows.length === 0) return [];

    await transaction
      .updateTable("outbox_events")
      .set({
        status: "processing",
        locked_until: input.leaseUntil,
        last_error: null,
      })
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
    }));
  });
}

export async function markProcessed(
  database: DatabaseExecutor,
  eventId: string,
  now: Date,
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
    .execute();
}

export async function markRetry(
  database: DatabaseExecutor,
  input: {
    eventId: string;
    attemptCount: number;
    availableAt: Date;
    error: string;
  },
): Promise<void> {
  await database
    .updateTable("outbox_events")
    .set({
      status: "pending",
      attempt_count: input.attemptCount,
      available_at: input.availableAt,
      locked_until: null,
      last_error: input.error,
    })
    .where("id", "=", input.eventId)
    .execute();
}

export async function markFailed(
  database: DatabaseExecutor,
  input: { eventId: string; attemptCount: number; error: string },
): Promise<void> {
  await database
    .updateTable("outbox_events")
    .set({
      status: "failed",
      attempt_count: input.attemptCount,
      locked_until: null,
      last_error: input.error,
    })
    .where("id", "=", input.eventId)
    .execute();
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
