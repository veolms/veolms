import type { Generated } from "kysely";
import type { Json } from "./json.schema.ts";

export type NotificationCategory =
  "transactional" | "social" | "learning" | "system";
export type NotificationChannel = "in_app" | "email";
export type NotificationDeliveryStatus =
  "pending" | "processing" | "sent" | "failed" | "skipped";

export interface NotificationTable {
  id: string;
  source_event_id: string;
  recipient_user_id: string;
  type: string;
  category: NotificationCategory;
  title: string;
  body: string;
  deep_link: string | null;
  read_at: Date | null;
  archived_at: Date | null;
  created_at: Generated<Date>;
}

export interface NotificationDeliveryTable {
  id: string;
  notification_id: string;
  channel: NotificationChannel;
  status: NotificationDeliveryStatus;
  destination: string | null;
  payload: Json | null;
  attempt_count: Generated<number>;
  next_attempt_at: Generated<Date>;
  locked_until: Date | null;
  provider_message_id: string | null;
  last_error: string | null;
  sent_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface NotificationPreferenceTable {
  user_id: string;
  notification_type: string;
  channel: NotificationChannel;
  enabled: boolean;
}
