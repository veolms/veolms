import type { ColumnType, Generated, JSONColumnType } from "kysely";

export type MarketingEmailKind = "broadcast" | "automation";

export type MarketingEmailStatus =
  | "draft"
  | "scheduled"
  | "sending"
  | "sent"
  | "cancelled"
  | "active"
  | "paused";

export type MarketingRecipientStatus =
  "pending" | "sent" | "failed" | "skipped";

/**
 * A broadcast, or the email of one ready automation
 * (creator-features/34-email-marketing-plan.md). `blocks`, `audience` and
 * `settings` are checked by the contracts' schemas on the way in.
 */
export interface MarketingEmailTable {
  id: Generated<string>;
  kind: MarketingEmailKind;
  automation_key: string | null;
  name: string;
  subject: Generated<string>;
  preheader: Generated<string>;
  blocks: JSONColumnType<unknown[], string | undefined, string>;
  audience: JSONColumnType<
    Record<string, unknown> | null,
    string | null,
    string | null
  >;
  settings: JSONColumnType<
    Record<string, unknown> | null,
    string | null,
    string | null
  >;
  status: MarketingEmailStatus;
  scheduled_at: Date | null;
  started_at: Date | null;
  finished_at: Date | null;
  enabled_at: Date | null;
  resend_of: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  deleted_at: Date | null;
}

/** One person's copy of a marketing email: the send queue and the report. */
export interface MarketingEmailRecipientTable {
  email_id: string;
  user_id: string;
  email: string;
  course_id: string | null;
  status: Generated<MarketingRecipientStatus>;
  due_at: Generated<Date>;
  attempt_count: Generated<number>;
  locked_until: Date | null;
  sent_at: Date | null;
  opened_at: Date | null;
  clicked_at: Date | null;
  unsubscribed_at: Date | null;
  last_error: string | null;
  created_at: ColumnType<Date, Date | undefined, never>;
}
