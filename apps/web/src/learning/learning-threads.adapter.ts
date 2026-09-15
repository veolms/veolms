import type { LearningThread } from "@veolms/contracts";
import type { Comment } from "./CommentCard";
import { createDiscussionDraft } from "./discussion-editor/types";
import { formatRelativeTime } from "./learning-notes.adapter";
import {
  getClientEntityId,
  getServerEntityId,
  isPendingClientEntity,
  type ThreadEntityLike,
} from "../services/learning-interactions/interaction-entities";

export function isCommentOrQaThread(thread: LearningThread): boolean {
  return (
    thread.kind === "comment" ||
    thread.kind === "question" ||
    thread.kind === "qna"
  );
}

export function adaptLearningThreadToComment(
  thread: ThreadEntityLike,
  currentUserId?: string,
): Comment {
  const contentDraft = createDiscussionDraft(thread.content);
  if (thread.plainText) {
    contentDraft.plainText = thread.plainText;
  }

  const isQuestion = thread.kind === "question" || thread.kind === "qna";
  const entryKind = isQuestion ? "question" : "comment";

  const firstAttachment = thread.attachments?.[0];
  const attachment = firstAttachment
    ? {
        name: firstAttachment.fileName,
        meta: `${firstAttachment.mimeType} · ${Math.round(firstAttachment.fileSize / 1024)} KB`,
      }
    : undefined;

  return {
    // Comment.id is UI identity. It must remain stable while an optimistic
    // thread is reconciled from its temporary client ID to a server UUID.
    id: getClientEntityId(thread),
    clientId: getClientEntityId(thread),
    serverId: getServerEntityId(thread),
    creationStatus: isPendingClientEntity(thread) ? "pending" : "confirmed",
    name: thread.author.displayName || thread.author.username || "Learner",
    time: formatRelativeTime(thread.createdAt),
    avatar: thread.author.avatarUrl || "/assets/sofia-avatar-160.webp",
    text: thread.plainText || thread.content,
    content: contentDraft,
    visibility: thread.visibility,
    likes: thread.likesCount ?? 0,
    liked: Boolean(thread.isLiked),
    replies: thread.repliesCount ?? 0,
    thread: [],
    isQuestion,
    entryKind,
    role: thread.author.role,
    attachment,
    attachments: thread.attachments || [],
    isOwn:
      thread.isOwn ?? (currentUserId ? thread.userId === currentUserId : false),
    createdAt: thread.createdAt,
    timestampSeconds: thread.timestampSeconds ?? null,
    acceptedAnswerId: thread.acceptedAnswerId ?? null,
    isSolved: Boolean(thread.acceptedAnswerId),
    isLocked: Boolean(thread.isLocked),
    isBookmarked: Boolean(thread.isBookmarked),
    isFollowing: Boolean(thread.isFollowing),
  };
}
