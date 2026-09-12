import type { LearningThread } from "@veolms/contracts";
import type { Comment } from "./CommentCard";
import { createDiscussionDraft } from "./discussion-editor/types";
import { formatRelativeTime } from "./learning-notes.adapter";

export function isCommentOrQaThread(thread: LearningThread): boolean {
  return (
    thread.kind === "comment" ||
    thread.kind === "question" ||
    thread.kind === "qna"
  );
}

export function adaptLearningThreadToComment(
  thread: LearningThread,
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
    id: thread.id,
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
    isOwn:
      thread.isOwn ??
      (currentUserId ? thread.userId === currentUserId : false),
    createdAt: thread.createdAt,
    timestampSeconds: thread.timestampSeconds ?? null,
  };
}
