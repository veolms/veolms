import type { ColumnType, Generated, JSONColumnType } from "kysely";

/** Chat tables (migration 20261108100000-create-chat). */

export type ChatRoomKind = "course" | "team" | "direct";
export type ChatDirectStatus = "requested" | "accepted" | "declined";
export type ChatPostingPolicy = "everyone" | "staff_only";
export type ChatRoomStatus = "active" | "locked" | "archived";
export type ChatRoomRole = "owner" | "moderator" | "member";
export type ChatMemberState = "active" | "left" | "pending" | "hidden";
export type ChatNotifyLevel = "all" | "mentions" | "none";
export type ChatSenderRole =
  "admin" | "instructor" | "staff" | "helper" | "learner";
export type ChatMessageKind = "text" | "system";
export type ChatDeletedReason = "self" | "admin" | "purge";
export type ChatRestrictionType = "mute" | "ban" | "no_direct";
export type ChatReason =
  "spam" | "harassment" | "scam" | "inappropriate" | "other";
export type ChatReportStatus = "open" | "actioned" | "dismissed";
export type ChatDirectPolicy = "off" | "staff_only" | "course_peers";

/** Postgres bigint arrives as a string; written as number or string. */
type BigIntColumn = ColumnType<string, number | string, number | string>;
type GeneratedBigInt = ColumnType<
  string,
  number | string | undefined,
  number | string
>;

export interface ChatSettingsTable {
  id: Generated<number>;
  direct_policy: Generated<ChatDirectPolicy>;
  course_retention_months: Generated<number>;
  max_direct_requests_per_day: Generated<number>;
  max_helpers_per_room: Generated<number>;
  updated_by: string | null;
  updated_at: Generated<Date>;
}

export interface ChatRoomTable {
  id: string;
  kind: ChatRoomKind;
  course_id: string | null;
  direct_key: string | null;
  direct_status: ChatDirectStatus | null;
  requested_by: string | null;
  title: string | null;
  description: string | null;
  posting_policy: Generated<ChatPostingPolicy>;
  slow_mode_seconds: Generated<number>;
  attachments_allowed: Generated<boolean>;
  direct_messages_allowed: Generated<boolean>;
  /** An uploaded photo shown as the group's icon. */
  icon_upload_id: ColumnType<
    string | null,
    string | null | undefined,
    string | null
  >;
  status: Generated<ChatRoomStatus>;
  last_seq: GeneratedBigInt;
  last_event_seq: GeneratedBigInt;
  last_message_at: Date | null;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ChatMemberTable {
  room_id: string;
  user_id: string;
  room_role: Generated<ChatRoomRole>;
  state: Generated<ChatMemberState>;
  last_read_seq: GeneratedBigInt;
  last_delivered_seq: GeneratedBigInt;
  notify_level: Generated<ChatNotifyLevel>;
  /** Muted for a while (8 hours, a week); for good is notify_level none. */
  muted_until: Date | null;
  archived_at: Date | null;
  pinned_at: Date | null;
  /** Messages up to here are cleared for this member ("Clear chat"). */
  cleared_seq: GeneratedBigInt;
  /** "Delete chat": out of their list until a newer message arrives. */
  deleted_at: Date | null;
  joined_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export type ChatUploadKind = "image" | "video" | "audio" | "file";

export interface ChatAttachmentRef {
  id: string;
  kind: ChatUploadKind;
  name: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  waveform: number[] | null;
}

export interface ChatUploadTable {
  id: string;
  owner_id: string;
  room_id: string;
  kind: ChatUploadKind;
  mime_type: string;
  file_name: string;
  size_bytes: ColumnType<string, number | string, number | string>;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  waveform: JSONColumnType<number[] | null, string | null, string | null>;
  storage_key: string;
  status: Generated<"pending" | "ready" | "attached">;
  message_seq: ColumnType<
    string | null,
    number | string | null | undefined,
    number | string | null
  >;
  created_at: Generated<Date>;
}

export interface ChatMessageTable {
  room_id: string;
  seq: BigIntColumn;
  id: string;
  version_seq: BigIntColumn;
  sender_id: string | null;
  sender_role: Generated<ChatSenderRole>;
  kind: Generated<ChatMessageKind>;
  body: string;
  reply_to_seq: BigIntColumn | null;
  mentions: Generated<string[]>;
  mention_all: Generated<boolean>;
  attachments: JSONColumnType<ChatAttachmentRef[], string | undefined, string>;
  reaction_counts: JSONColumnType<
    Record<string, number>,
    string | undefined,
    string
  >;
  client_id: string | null;
  pinned_at: Date | null;
  pinned_by: string | null;
  created_at: Generated<Date>;
  edited_at: Date | null;
  deleted_at: Date | null;
  deleted_by: string | null;
  deleted_reason: ChatDeletedReason | null;
}

export interface ChatReactionTable {
  room_id: string;
  seq: BigIntColumn;
  user_id: string;
  emoji: string;
  created_at: Generated<Date>;
}

export interface ChatStarTable {
  user_id: string;
  room_id: string;
  seq: BigIntColumn;
  created_at: Generated<Date>;
}

export interface ChatHiddenMessageTable {
  user_id: string;
  room_id: string;
  seq: BigIntColumn;
  created_at: Generated<Date>;
}

export interface ChatRestrictionTable {
  id: string;
  user_id: string;
  room_id: string | null;
  type: ChatRestrictionType;
  until: Date | null;
  reason: ChatReason;
  note: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
  revoked_at: Date | null;
  revoked_by: string | null;
}

export interface ChatUserBlockTable {
  blocker_id: string;
  blocked_id: string;
  created_at: Generated<Date>;
}

export interface ChatReportSnapshot {
  senderName: string | null;
  body: string;
  sentAt: string;
  context: Array<{ seq: string; senderName: string | null; body: string }>;
}

export interface ChatReportTable {
  id: string;
  room_id: string;
  seq: BigIntColumn;
  reported_user_id: string | null;
  reporter_id: string | null;
  reason: ChatReason;
  details: string | null;
  snapshot: JSONColumnType<ChatReportSnapshot, string, string>;
  status: Generated<ChatReportStatus>;
  handled_by: string | null;
  handled_at: Date | null;
  created_at: Generated<Date>;
}

export interface ChatModerationLogTable {
  id: string;
  actor_id: string | null;
  action: string;
  room_id: string | null;
  target_user_id: string | null;
  seq: BigIntColumn | null;
  details: JSONColumnType<Record<string, unknown>, string | undefined, string>;
  created_at: Generated<Date>;
}

/** Presence and chat privacy, one row per person who has used chat. */
export interface ChatProfileTable {
  user_id: string;
  show_presence: Generated<boolean>;
  read_receipts: Generated<boolean>;
  enter_to_send: Generated<boolean>;
  online_until: Date | null;
  last_seen_at: Date | null;
  updated_at: Generated<Date>;
}

/** When a member's received / read position moved (Message info's times). */
export interface ChatReceiptMarkTable {
  room_id: string;
  user_id: string;
  read_seq: ColumnType<string, number | string, number | string>;
  delivered_seq: ColumnType<string, number | string, number | string>;
  at: Generated<Date>;
}
