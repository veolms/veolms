import type { Generated } from "kysely";

export type DiscussionEntryKind = "comment" | "question" | "note";
export type DiscussionVisibility = "public" | "private" | "unlisted";
export type InteractionStatus = "active" | "hidden" | "deleted";
export type EngagementTargetType = "thread" | "reply";
export type AttachmentKind =
  | "image"
  | "screenshot"
  | "code"
  | "link"
  | "document";
export type AttachmentTargetType = "thread" | "reply" | "note";
export type ReportReason =
  | "spam"
  | "harassment"
  | "inappropriate"
  | "misinformation"
  | "copyright"
  | "other";
export type ReportStatus =
  | "pending"
  | "reviewed"
  | "dismissed"
  | "actioned";

export interface LearningThreadTable {
  id: string;
  academy_id: string;
  course_id: string;
  lesson_id: string;
  user_id: string;
  kind: DiscussionEntryKind;
  title: string | null;
  content: string;
  plain_text: string;
  timestamp_seconds: number | null;
  visibility: DiscussionVisibility;
  status: Generated<InteractionStatus>;
  is_locked: Generated<boolean>;
  accepted_answer_id: string | null;
  likes_count: Generated<number>;
  replies_count: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  deleted_at: Date | null;
}

export interface LearningReplyTable {
  id: string;
  thread_id: string;
  parent_reply_id: string | null;
  user_id: string;
  content: string;
  plain_text: string;
  timestamp_seconds: number | null;
  is_accepted: Generated<boolean>;
  status: Generated<InteractionStatus>;
  likes_count: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  deleted_at: Date | null;
}

export interface LearningLikeTable {
  id: string;
  user_id: string;
  target_type: EngagementTargetType;
  target_id: string;
  created_at: Generated<Date>;
}

export interface LearningBookmarkTable {
  id: string;
  user_id: string;
  thread_id: string;
  created_at: Generated<Date>;
}

export interface LearningFollowTable {
  id: string;
  user_id: string;
  thread_id: string;
  created_at: Generated<Date>;
}

export interface LearningMentionTable {
  id: string;
  source_type: EngagementTargetType;
  source_id: string;
  mentioned_user_id: string;
  created_at: Generated<Date>;
}

export interface LearningNoteTable {
  id: string;
  academy_id: string;
  user_id: string;
  course_id: string;
  lesson_id: string;
  timestamp_seconds: number | null;
  title: string | null;
  content: string;
  plain_text: string;
  tags: Generated<string[]>;
  visibility: Generated<DiscussionVisibility>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  deleted_at: Date | null;
}

export interface LearningAttachmentTable {
  id: string;
  target_type: AttachmentTargetType | null;
  target_id: string | null;
  kind: AttachmentKind;
  file_name: string;
  file_url: string;
  mime_type: string;
  file_size: number;
  metadata: unknown | null;
  created_at: Generated<Date>;
}

export interface LearningReportTable {
  id: string;
  reporter_id: string;
  target_type: EngagementTargetType;
  target_id: string;
  reason: ReportReason;
  details: string | null;
  status: Generated<ReportStatus>;
  reviewed_by_user_id: string | null;
  action_taken: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface LearningSuspensionTable {
  id: string;
  academy_id: string;
  user_id: string;
  suspended_by_user_id: string;
  reason: string;
  expires_at: Date | null;
  is_active: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface LearningAuditLogTable {
  id: string;
  academy_id: string;
  actor_user_id: string;
  action: string;
  target_type: string;
  target_id: string;
  details: unknown | null;
  ip_address: string | null;
  created_at: Generated<Date>;
}
