import type { LearningReply } from "@veolms/contracts";
import type { CommentReply } from "./CommentCard";
import { createDiscussionDraft } from "./discussion-editor/types";
import { formatRelativeTime } from "./learning-notes.adapter";

export function adaptLearningReplyToCommentReply(
  reply: LearningReply,
  currentUserId?: string,
): CommentReply {
  const contentDraft = createDiscussionDraft(reply.content);
  if (reply.plainText) {
    contentDraft.plainText = reply.plainText;
  }

  return {
    id: reply.id,
    name: reply.author.displayName || reply.author.username || "Learner",
    time: formatRelativeTime(reply.createdAt),
    avatar: reply.author.avatarUrl || "/assets/sofia-avatar-160.webp",
    text: reply.plainText || reply.content,
    content: contentDraft,
    likes: reply.likesCount ?? 0,
    liked: Boolean(reply.isLiked),
    role: reply.author.role === "Instructor" ? "Instructor" : undefined,
    isOwn:
      reply.isOwn ??
      (currentUserId ? reply.userId === currentUserId : false),
  };
}
