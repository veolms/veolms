import type {
  AttachmentKind,
  AttachmentStatus,
  AttachmentTargetType,
  DiscussionEntryKind,
  DiscussionVisibility,
  EngagementTargetType,
  InteractionStatus,
  ReportReason,
  ReportStatus,
  SuspensionScope,
} from "@veolms/contracts";

export interface ThreadEntity {
  id: string;
  academyId: string;
  courseId: string;
  lessonId: string | null;
  assignmentId: string | null;
  userId: string;
  kind: DiscussionEntryKind;
  title: string | null;
  content: string;
  plainText: string;
  timestampSeconds: number | null;
  visibility: DiscussionVisibility;
  status: InteractionStatus;
  isLocked: boolean;
  acceptedAnswerId: string | null;
  likesCount: number;
  repliesCount: number;
  createdAt: Date | string;
  updatedAt: Date | string;
  deletedAt: Date | string | null;
}

export interface ReplyEntity {
  id: string;
  threadId: string;
  parentReplyId: string | null;
  userId: string;
  content: string;
  plainText: string;
  timestampSeconds: number | null;
  isAccepted: boolean;
  status: InteractionStatus;
  likesCount: number;
  createdAt: Date | string;
  updatedAt: Date | string;
  deletedAt: Date | string | null;
}

export interface NoteEntity {
  id: string;
  academyId: string;
  userId: string;
  courseId: string;
  lessonId: string;
  timestampSeconds: number | null;
  title: string | null;
  content: string;
  plainText: string;
  tags: string[];
  createdAt: Date | string;
  updatedAt: Date | string;
  deletedAt: Date | string | null;
}

export interface AttachmentEntity {
  id: string;
  ownerId: string;
  targetType: AttachmentTargetType | null;
  targetId: string | null;
  kind: AttachmentKind;
  storageKey: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  fileSize: number;
  status: AttachmentStatus;
  metadata: Record<string, unknown> | null;
  createdAt: Date | string;
}

export interface ReportEntity {
  id: string;
  courseId: string | null;
  reporterId: string;
  targetType: EngagementTargetType;
  targetId: string;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  reviewedByUserId: string | null;
  actionTaken: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface SuspensionEntity {
  id: string;
  academyId: string;
  courseId: string | null;
  userId: string;
  suspendedByUserId: string | null;
  scope: SuspensionScope;
  reason: string;
  expiresAt: Date | string | null;
  isActive: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}
