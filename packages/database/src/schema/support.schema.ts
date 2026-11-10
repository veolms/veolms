import type { Generated, JSONColumnType } from "kysely";

export type SupportTicketKind = "problem" | "feedback";

export type SupportTicketCategory =
  | "video"
  | "access"
  | "payment"
  | "account"
  | "bug"
  | "other"
  | "post"
  | "idea"
  | "like"
  | "confusing"
  | "content";

/** Problems: open → in_progress / waiting → resolved. Feedback: new → reviewed → planned. */
export type SupportTicketStatus =
  | "open"
  | "in_progress"
  | "waiting"
  | "resolved"
  | "new"
  | "reviewed"
  | "planned";

/** Browser details a learner chose to send with a report. */
export interface SupportTechnicalDetails {
  browser?: string;
  os?: string;
  screen?: string;
  appVersion?: string;
  userAgent?: string;
}

export interface SupportTicketTable {
  id: string;
  number: Generated<string>;
  user_id: string;
  kind: SupportTicketKind;
  category: SupportTicketCategory;
  rating: number | null;
  status: SupportTicketStatus;
  title: string;
  content: string;
  plain_text: string;
  page_path: string | null;
  page_label: string | null;
  course_id: string | null;
  technical: JSONColumnType<
    SupportTechnicalDetails | null,
    string | null,
    string | null
  >;
  contact_allowed: Generated<boolean>;
  /** The team member working on it; internal, never shown to the learner. */
  assignee_id: string | null;
  assigned_at: Date | null;
  assigned_by: string | null;
  priority: SupportTicketPriority | null;
  user_unread: Generated<boolean>;
  staff_unread: Generated<boolean>;
  last_message_at: Generated<Date>;
  resolved_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SupportMessageTable {
  id: string;
  ticket_id: string;
  author_id: string | null;
  author_role: "user" | "staff";
  internal: Generated<boolean>;
  content: string;
  plain_text: string;
  created_at: Generated<Date>;
  /** Set when an internal note is edited. */
  updated_at: Date | null;
  edited_by: string | null;
  pinned: Generated<boolean>;
  pinned_at: Date | null;
  /** An internal note deleted: kept for the record, never listed. */
  deleted_at: Date | null;
  deleted_by: string | null;
}

export type SupportTicketPriority = "low" | "medium" | "high" | "urgent";

export type SupportEventType =
  | "assigned"
  | "unassigned"
  | "status_changed"
  | "priority_changed"
  | "category_changed"
  | "note_pinned"
  | "note_unpinned"
  | "note_deleted";

/** What the team did to a ticket, for its Activity log. */
export interface SupportEventTable {
  id: string;
  /** The order they happened in; changes made in one step share a time. */
  seq: Generated<string>;
  ticket_id: string;
  actor_id: string | null;
  type: SupportEventType;
  data: JSONColumnType<Record<string, unknown>, string, string>;
  created_at: Generated<Date>;
}

export interface SupportAttachmentTable {
  id: string;
  owner_id: string;
  ticket_id: string | null;
  message_id: string | null;
  storage_key: string;
  file_name: string;
  mime_type: string;
  file_size: string | number;
  width: number | null;
  height: number | null;
  created_at: Generated<Date>;
}
