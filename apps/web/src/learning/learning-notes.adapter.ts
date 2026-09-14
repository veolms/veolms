import type { LearningNote } from "@veolms/contracts";
import type { Comment } from "./CommentCard";
import { createDiscussionDraft } from "./discussion-editor/types";

export function formatRelativeTime(dateInput: string | Date): string {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const now = Date.now();
  const diffMs = Math.max(0, now - date.getTime());
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSec < 60) return "Just now";
  if (diffMin < 60)
    return `${diffMin} ${diffMin === 1 ? "minute" : "minutes"} ago`;
  if (diffHours < 24)
    return `${diffHours} ${diffHours === 1 ? "hour" : "hours"} ago`;
  if (diffDays < 7) return `${diffDays} ${diffDays === 1 ? "day" : "days"} ago`;
  return date.toLocaleDateString();
}

export function adaptLearningNoteToComment(
  note: LearningNote,
  currentUserName?: string,
  currentUserAvatar?: string,
  currentUserId?: string,
): Comment {
  const contentDraft = createDiscussionDraft(note.content);
  if (note.plainText) {
    contentDraft.plainText = note.plainText;
  }

  // Derive ownership primarily from note.isOwn with userId comparison as fallback
  const isOwn =
    note.isOwn ??
    (currentUserId ? String(note.userId) === String(currentUserId) : false);

  const name =
    note.authorName?.trim() ||
    note.authorUsername?.trim() ||
    (isOwn && currentUserName?.trim() ? currentUserName.trim() : "Learner");

  // Real note author avatar if DTO provides one, else current user avatar if own, else safe fallback
  const avatar =
    (note as { authorAvatarUrl?: string }).authorAvatarUrl ||
    (isOwn && currentUserAvatar ? currentUserAvatar : "/assets/sofia-avatar-160.webp");

  return {
    id: note.id,
    clientId: (note as any).clientId ?? note.id,
    name,
    time: formatRelativeTime(note.createdAt),
    avatar,
    text: note.plainText || note.content,
    content: contentDraft,
    visibility: note.visibility || "private",
    likes: note.likesCount ?? 0,
    liked: Boolean(note.isLiked),
    replies: note.repliesCount ?? 0,
    entryKind: "note",
    isOwn,
    createdAt: note.createdAt,
    timestampSeconds: note.timestampSeconds ?? null,
    attachments: note.attachments || [],
  };
}
