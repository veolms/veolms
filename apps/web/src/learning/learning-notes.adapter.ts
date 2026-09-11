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
  if (diffMin < 60) return `${diffMin} ${diffMin === 1 ? "minute" : "minutes"} ago`;
  if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? "hour" : "hours"} ago`;
  if (diffDays < 7) return `${diffDays} ${diffDays === 1 ? "day" : "days"} ago`;
  return date.toLocaleDateString();
}

export function adaptLearningNoteToComment(
  note: LearningNote,
  currentUserName: string,
  currentUserAvatar: string,
): Comment {
  const contentDraft = createDiscussionDraft(note.content);
  if (note.plainText) {
    contentDraft.plainText = note.plainText;
  }

  return {
    id: note.id,
    name: currentUserName,
    time: formatRelativeTime(note.createdAt),
    avatar: currentUserAvatar,
    text: note.plainText || note.content,
    content: contentDraft,
    visibility: note.visibility || "private",
    likes: 0,
    liked: false,
    replies: 0,
    entryKind: "note",
    isOwn: true,
    createdAt: note.createdAt,
    timestampSeconds: note.timestampSeconds ?? null,
  };
}
