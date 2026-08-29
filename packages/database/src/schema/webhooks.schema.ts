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
  event_name: string;
  aggregate_type: string;
  aggregate_id: string;
  payload: Json;
  processed_at: Date | null;
  error: string | null;
  created_at: Generated<Date>;
}
