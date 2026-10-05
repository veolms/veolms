import { sql } from "kysely";

import type { Json } from "@veolms/database";
import type { Executor } from "../shared/repository.types.ts";

export async function findWebhookEvent(
  database: Executor,
  provider: string,
  eventId: string,
) {
  return await database
    .selectFrom("webhook_events")
    .selectAll()
    .where("provider", "=", provider)
    .where("event_id", "=", eventId)
    .executeTakeFirst();
}

export async function insertWebhookEvent(
  database: Executor,
  values: {
    id: string;
    provider: string;
    event_id: string;
    event_type: string;
    payload: Json;
    processed_at?: Date | null;
    error?: string | null;
    created_at?: Date;
  },
) {
  return await database
    .insertInto("webhook_events")
    .values(values)
    .returningAll()
    .executeTakeFirstOrThrow();
}

/**
 * Atomically claims up to `limit` due webhook events for processing.
 *
 * `FOR UPDATE SKIP LOCKED` makes the claim safe across replicas and across a
 * poll tick racing an enqueue kick in the same process. Each claimed row has
 * `attempts` incremented and `next_attempt_at` pushed `leaseSeconds` into the
 * future, acting as a lease: if the claimer crashes mid-processing, the row
 * becomes claimable again after the lease instead of being lost — and if it
 * keeps failing, the caller's failure path (`markWebhookEventFailed`) extends
 * the backoff and eventually dead-letters it, so poisoned rows cannot starve
 * newer events (the old queue's head-of-line blocking).
 */
export async function claimDueWebhookEvents(
  database: Executor,
  { limit, leaseSeconds }: { limit: number; leaseSeconds: number },
) {
  return await database
    .updateTable("webhook_events")
    .set((eb) => ({
      attempts: eb("attempts", "+", 1),
      next_attempt_at: sql<Date>`now() + make_interval(secs => ${leaseSeconds})`,
    }))
    .where("id", "in", (eb) =>
      eb
        .selectFrom("webhook_events")
        .select("id")
        .where("processed_at", "is", null)
        .where("dead_at", "is", null)
        .where((web) =>
          web.or([
            web("next_attempt_at", "is", null),
            web("next_attempt_at", "<=", sql<Date>`now()`),
          ]),
        )
        .orderBy("created_at", "asc")
        .limit(limit)
        .forUpdate()
        .skipLocked(),
    )
    .returningAll()
    .execute();
}

/** Queue-depth gauges for the ops heartbeat. */
export async function getWebhookQueueDepth(
  database: Executor,
): Promise<{ unprocessed: number; dead: number }> {
  const row = await database
    .selectFrom("webhook_events")
    .select([
      sql<number>`(count(*) filter (where processed_at is null and dead_at is null))::int`.as(
        "unprocessed",
      ),
      sql<number>`(count(*) filter (where dead_at is not null))::int`.as(
        "dead",
      ),
    ])
    .where((eb) =>
      eb.or([eb("processed_at", "is", null), eb("dead_at", "is not", null)]),
    )
    .executeTakeFirst();
  return {
    unprocessed: Number(row?.unprocessed ?? 0),
    dead: Number(row?.dead ?? 0),
  };
}

/**
 * Deletes successfully processed webhook events older than the retention
 * window, in bounded batches so a large first run cannot hold a long
 * transaction. Dead-lettered and unprocessed rows are never touched.
 * Returns the number of rows deleted (callers loop while it equals `limit`
 * if they want a full drain; the scheduler just takes one batch per tick).
 */
export async function deleteProcessedWebhookEventsOlderThan(
  database: Executor,
  retentionDays: number,
  limit = 1000,
): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const result = await database
    .deleteFrom("webhook_events")
    .where("id", "in", (eb) =>
      eb
        .selectFrom("webhook_events")
        .select("id")
        .where("processed_at", "is not", null)
        .where("processed_at", "<", cutoff)
        .where("dead_at", "is", null)
        .limit(limit),
    )
    .executeTakeFirst();
  return Number(result.numDeletedRows ?? 0);
}

/**
 * Mark a webhook event as successfully processed. Only call this once the
 * handler has actually completed — this is what removes the event from the
 * poller's retry pickup (`WHERE processed_at IS NULL`).
 */
export async function markWebhookEventProcessed(
  database: Executor,
  id: string,
) {
  return await database
    .updateTable("webhook_events")
    .set({
      processed_at: new Date(),
      error: null,
    })
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();
}

/**
 * Record a failed processing attempt without marking the event processed.
 *
 * Deliberately leaves `processed_at` untouched (NULL) so the event stays
 * eligible for retry — but with a backoff: `next_attempt_at` defers the next
 * claim (exponential in the attempt count, caller-computed) instead of the
 * old retry-every-poll-tick-forever behavior. Once the caller decides the
 * attempt cap is reached it passes `deadAt`, which dead-letters the event:
 * it stops being claimed, stays queryable for operators, and no longer
 * occupies one of the poll batch's slots.
 */
export async function markWebhookEventFailed(
  database: Executor,
  id: string,
  error: string,
  options?: { nextAttemptAt?: Date; deadAt?: Date },
) {
  return await database
    .updateTable("webhook_events")
    .set({
      error,
      ...(options?.nextAttemptAt
        ? { next_attempt_at: options.nextAttemptAt }
        : {}),
      ...(options?.deadAt ? { dead_at: options.deadAt } : {}),
    })
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();
}
