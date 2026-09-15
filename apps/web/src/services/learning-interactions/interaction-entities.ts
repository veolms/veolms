import type {
  CreateLearningReplyRequest,
  CreateLearningThreadRequest,
  LearningReply,
  LearningThreadAttachmentSummary,
  LearningThread,
} from "@veolms/contracts";

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

export type LearningThreadEntity = Omit<LearningThread, "id"> &
  ClientEntityIdentity & {
    /** Compatibility value for existing view-model consumers. */
    id: string;
  };

export type LearningReplyEntity = Omit<LearningReply, "id" | "threadId"> &
  ClientEntityIdentity & {
    id: string;
    threadId: string;
    parentClientId?: string;
    parentServerId?: string;
    localSequence: number;
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

function createClientId(): string {
  const randomUuid =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `client-thread-${randomUuid}`;
}

function createReplyClientId(): string {
  const randomUuid =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `client-reply-${randomUuid}`;
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
  const clientId = createClientId();
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
    attachments: [],
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
  parentClientId: string;
  parentServerId?: string;
  localSequence: number;
  attachments?: readonly LearningThreadAttachmentSummary[];
  userId?: string;
  displayName?: string;
  username?: string;
  avatarUrl?: string | null;
  role?: "Student" | "Instructor" | "Admin";
}

export function createOptimisticLearningReply(
  payload: CreateLearningReplyRequest,
  context: OptimisticReplyContext,
): LearningReplyEntity {
  const clientId = createReplyClientId();
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
