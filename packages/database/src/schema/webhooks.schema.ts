import type { Generated } from "kysely";
import type { Json } from "./json.schema.ts";

export interface WebhookEventTable {
  id: string;
  provider: string;
  event_id: string;
  event_type: string;
  payload: Json;
  processed_at: Date | null;
  error: string | null;
  created_at: Generated<Date>;
}

export interface CallbackInboxTable {
  id: string;
  provider: string;
  event_id: string;
  event_type: string;
  payload: Json;
  processed_at: Date | null;
  error: string | null;
  created_at: Generated<Date>;
}

export interface OutboxEventTable {
  id: string;
  event_type: string;
  event_version: Generated<number>;
  dedupe_key: string;
  payload: Json;
  status: Generated<"pending" | "processing" | "processed" | "failed">;
  attempt_count: Generated<number>;
  available_at: Generated<Date>;
  locked_until: Date | null;
  last_error: string | null;
  occurred_at: Generated<Date>;
  created_at: Generated<Date>;
  processed_at: Date | null;
}
