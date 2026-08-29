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
 * Mark a webhook event as successfully processed. Only call this once the
 * handler has actually completed — this is what removes the event from the
 * poller's retry pickup (`WHERE processed_at IS NULL`).
 */
export async function markWebhookEventProcessed(database: Executor, id: string) {
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
 * eligible for the poller's `WHERE processed_at IS NULL` retry query — only
 * the `error` column is updated, for visibility into the last failure. Using
 * `markWebhookEventProcessed` here instead (as before) would set
 * `processed_at = now()` on a failed attempt, permanently burying the event
 * with no retry and no alert.
 */
export async function markWebhookEventFailed(database: Executor, id: string, error: string) {
  return await database
    .updateTable("webhook_events")
    .set({ error })
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();
}
