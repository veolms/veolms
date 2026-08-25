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
    payload: unknown;
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

export async function markWebhookEventProcessed(
  database: Executor,
  id: string,
  error?: string | null,
) {
  return await database
    .updateTable("webhook_events")
    .set({
      processed_at: new Date(),
      error: error ?? null,
    })
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();
}
