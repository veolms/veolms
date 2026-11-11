import type { Generated } from "kysely";
import type { Json } from "./json.schema.ts";

export type NotificationCategory =
  "transactional" | "social" | "learning" | "system";
export type NotificationChannel = "in_app" | "email" | "push";
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

export type PushPlatform = "android" | "ios" | "web";
export type PushDeliverySource = "notification" | "chat";

/**
 * One app install that can receive pushes, keyed by its Firebase
 * Installation ID, or one browser (platform web, fid "web:" + endpoint hash).
 */
export interface PushDeviceTable {
  id: string;
  user_id: string;
  fid: string;
  /** Android package name or iOS bundle identifier. */
  application_id: string;
  platform: PushPlatform;
  app_version: string | null;
  device_label: string | null;
  session_id: string | null;
  push_allowed: Generated<boolean>;
  failure_count: Generated<number>;
  last_error: string | null;
  created_at: Generated<Date>;
  last_seen_at: Generated<Date>;
  last_success_at: Date | null;
  /** Browsers only: the push subscription (endpoint and its keys). */
  web_endpoint: string | null;
  web_p256dh: string | null;
  web_auth: string | null;
}

/** The push queue: one row per message per user. */
export interface PushDeliveryTable {
  id: string;
  user_id: string;
  source: PushDeliverySource;
  notification_id: string | null;
  dedupe_key: string;
  payload: Json;
  status: Generated<NotificationDeliveryStatus>;
  /** Installs still to receive it; null until sending starts (= all). */
  pending_device_ids: string[] | null;
  attempt_count: Generated<number>;
  next_attempt_at: Generated<Date>;
  locked_until: Date | null;
  last_error: string | null;
  sent_at: Date | null;
  expires_at: Date;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}
