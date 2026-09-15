import type {
  CreateLearningNoteRequest,
  CreateLearningReplyRequest,
  LearningNote,
  CreateLearningThreadRequest,
  LearningReply,
  LearningThreadAttachmentSummary,
  LearningThread,
} from "@veolms/contracts";
import {
  createClientEntityId,
  type InteractionAttachment,
} from "./attachment-model";

export type ClientEntityCreationStatus = "pending" | "confirmed";

/**
 * Client-only identity. Backend DTOs intentionally do not contain these
 * fields; they are added when a DTO enters the frontend cache/view-model
 * boundary.
 */
export interface ClientEntityIdentity {
  clientId: string;
  serverId?: string;
  creationStatus: ClientEntityCreationStatus;
}

export type LearningThreadEntity = Omit<LearningThread, "id" | "attachments"> &
  ClientEntityIdentity & {
    /** Compatibility value for existing view-model consumers. */
    id: string;
    attachments?: InteractionAttachment[];
  };

export type LearningReplyEntity = Omit<
  LearningReply,
  "id" | "threadId" | "attachments"
> &
  ClientEntityIdentity & {
    id: string;
    threadId: string;
    parentClientId?: string;
    parentServerId?: string;
    localSequence: number;
    attachments?: InteractionAttachment[];
  };

export type LearningNoteEntity = Omit<LearningNote, "id" | "attachments"> &
  ClientEntityIdentity & {
    /** Compatibility value for existing view-model consumers. */
    id: string;
    localSequence: number;
    authorAvatarUrl?: string;
    attachments: InteractionAttachment[];
  };

export type LearningNoteCacheItem = LearningNote | LearningNoteEntity;

export type LearningNotesCacheResponse = {
  notes: LearningNoteCacheItem[];
  nextCursor: string | null;
  totalCount?: number;
};

export type LearningReplyCacheItem = LearningReply | LearningReplyEntity;

export type LearningRepliesCacheResponse = {
  replies: LearningReplyCacheItem[];
  nextCursor: string | null;
  totalCount?: number;
};

export type LearningThreadCacheResponse = {
  threads: LearningThreadEntity[];
  nextCursor: string | null;
  totalCount?: number;
};

export type ThreadEntityLike = LearningThread | LearningThreadEntity;

export function getClientEntityId(entity: {
  id: string | number;
  clientId?: string;
}): string {
  return entity.clientId ?? String(entity.id);
}

export function getServerEntityId(entity: {
  id: string | number;
  serverId?: string;
  creationStatus?: ClientEntityCreationStatus;
}): string | undefined {
  if (entity.serverId) return entity.serverId;
  if (entity.creationStatus === "pending") return undefined;
  return String(entity.id);
}

export function isPendingClientEntity(entity: {
  id: string | number;
  serverId?: string;
  creationStatus?: ClientEntityCreationStatus;
}): boolean {
  return entity.creationStatus === "pending" && !entity.serverId;
}

export function isClientEntityId(value: string | undefined): boolean {
  return Boolean(value && value.startsWith("client-"));
}

export function requireServerEntityId(value: string | undefined): string {
  if (!value || isClientEntityId(value)) {
    throw new Error("A confirmed server entity ID is required for transport.");
  }
  return value;
}

export function isLearningThreadEntity(
  thread: ThreadEntityLike,
): thread is LearningThreadEntity {
  return (
    "clientId" in thread &&
    typeof thread.clientId === "string" &&
    "creationStatus" in thread
  );
}

export function toLearningThreadEntity(
  thread: LearningThread,
  clientId = thread.id,
): LearningThreadEntity {
  return {
    ...thread,
    id: thread.id,
    clientId,
    serverId: thread.id,
    creationStatus: "confirmed",
  };
}


function getOptimisticAuthor() {
  return {
    id: "optimistic-user",
    displayName: "You",
    username: "you",
    role: "Student" as const,
  };
}

function getOptimisticPlainText(content: string): string {
  return content
    .replace(/<[^>]*>/g, " ")
    .replace(/[*_`~#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface OptimisticThreadContext {
  clientId?: string;
  attachments?: readonly InteractionAttachment[];
  userId?: string;
  displayName?: string;
  username?: string;
  avatarUrl?: string | null;
  role?: "Student" | "Instructor" | "Admin";
}

export function createOptimisticLearningThread(
  payload: CreateLearningThreadRequest,
  context: OptimisticThreadContext = {},
): LearningThreadEntity {
  const clientId = context.clientId ?? createClientEntityId("thread");
  const now = new Date().toISOString();
  const author = {
    ...getOptimisticAuthor(),
    id: context.userId ?? "optimistic-user",
    displayName: context.displayName?.trim() || "You",
    username: context.username?.trim() || "you",
    avatarUrl: context.avatarUrl ?? null,
    role: context.role ?? "Student",
  };

  return {
    id: clientId,
    clientId,
    creationStatus: "pending",
    academyId: "optimistic-academy",
    courseId: payload.courseId,
    lessonId: payload.lessonId ?? null,
    userId: author.id,
    author,
    kind: payload.kind ?? "comment",
    title: payload.title ?? null,
    content: payload.content,
    plainText: getOptimisticPlainText(payload.content),
    timestampSeconds: payload.timestampSeconds ?? null,
    visibility: payload.visibility ?? "public",
    status: "active",
    isLocked: false,
    acceptedAnswerId: null,
    likesCount: 0,
    repliesCount: 0,
    tags: payload.tags,
    attachments: [...(context.attachments ?? [])],
    isLiked: false,
    isBookmarked: false,
    isFollowing: false,
    isOwn: true,
    createdAt: now,
    updatedAt: now,
  };
}

function getOptimisticReplyPlainText(content: string): string {
  return content
    .replace(/<[^>]*>/g, " ")
    .replace(/[*_`~#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface OptimisticReplyContext {
  clientId?: string;
  parentClientId: string;
  parentServerId?: string;
  localSequence: number;
  attachments?: readonly InteractionAttachment[];
  userId?: string;
  displayName?: string;
  username?: string;
  avatarUrl?: string | null;
  role?: "Student" | "Instructor" | "Admin";
}

export interface OptimisticNoteContext {
  clientId?: string;
  localSequence: number;
  attachments?: readonly InteractionAttachment[];
  userId?: string;
  displayName?: string;
  username?: string;
  avatarUrl?: string | null;
}

export function createOptimisticLearningNote(
  payload: CreateLearningNoteRequest,
  context: OptimisticNoteContext,
): LearningNoteEntity {
  const clientId = context.clientId ?? createClientEntityId("note");
  const now = new Date().toISOString();
  const displayName = context.displayName?.trim() || "You";
  const username = context.username?.trim() || "you";
  const plainText = payload.content
    .replace(/<[^>]*>/g, " ")
    .replace(/[*_`~#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return {
    id: clientId,
    clientId,
    serverId: undefined,
    creationStatus: "pending",
    localSequence: context.localSequence,
    userId: context.userId ?? "optimistic-user",
    authorName: displayName,
    authorUsername: username,
    authorAvatarUrl: context.avatarUrl ?? undefined,
    courseId: payload.courseId,
    lessonId: payload.lessonId,
    title: payload.title,
    content: payload.content,
    plainText,
    visibility: payload.visibility ?? "private",
    tags: [...(payload.tags ?? [])],
    timestampSeconds: payload.timestampSeconds ?? null,
    likesCount: 0,
    repliesCount: 0,
    isLiked: false,
    isOwn: true,
    attachments: [...(context.attachments ?? [])],
    createdAt: now,
    updatedAt: now,
  };
}

export function createOptimisticLearningReply(
  payload: CreateLearningReplyRequest,
  context: OptimisticReplyContext,
): LearningReplyEntity {
  const clientId = context.clientId ?? createClientEntityId("reply");
  const now = new Date().toISOString();
  const author = {
    id: context.userId ?? "optimistic-user",
    displayName: context.displayName?.trim() || "You",
    username: context.username?.trim() || "you",
    avatarUrl: context.avatarUrl ?? null,
    role: context.role ?? "Student",
  };

  return {
    id: clientId,
    clientId,
    serverId: undefined,
    creationStatus: "pending",
    threadId: context.parentServerId ?? context.parentClientId,
    parentReplyId: payload.parentReplyId,
    replyToReplyId: payload.replyToReplyId,
    replyToUserId: payload.replyToUserId,
    userId: author.id,
    author,
    content: payload.content,
    plainText: getOptimisticReplyPlainText(payload.content),
    timestampSeconds: payload.timestampSeconds ?? null,
    isAccepted: false,
    status: "active",
    likesCount: 0,
    attachments: [...(context.attachments ?? [])],
    isLiked: false,
    isOwn: true,
    createdAt: now,
    updatedAt: now,
    parentClientId: context.parentClientId,
    parentServerId: context.parentServerId,
    localSequence: context.localSequence,
  };
}
