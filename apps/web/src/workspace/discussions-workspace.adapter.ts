import type { WorkspaceDiscussionItem } from "@veolms/contracts";

export type DiscussionWorkspaceStatus =
  "answered" | "mentioned" | "solved" | "open";

export interface DiscussionWorkspaceCard {
  id: string;
  title?: string;
  excerpt: string;
  content: string;
  plainText: string;
  courseId: string;
  course: string;
  courseTitle: string | null;
  lessonId?: string | null;
  lesson: string;
  lessonTitle: string | null;
  parentThreadId?: string | null;
  parentThreadTitle?: string | null;
  timestampSeconds: number | null;
  author: string;
  authorUsername: string;
  avatar: string;
  isOwn: boolean;
  status?: DiscussionWorkspaceStatus;
  visibility?: WorkspaceDiscussionItem["visibility"];
  isLocked?: boolean;
  replies: number;
  likes: number;
  isLiked?: boolean;
  isBookmarked?: boolean;
  isFollowing?: boolean;
  isMentioned?: boolean;
  activity: string;
  mentionedAt?: string;
  mentionActivity?: string;
  attachmentSummary: WorkspaceDiscussionItem["attachmentSummary"];
  itemType: WorkspaceDiscussionItem["itemType"];
  kind: WorkspaceDiscussionItem["kind"];
  createdAt: string;
  updatedAt: string;
}

function formatRelativeTime(dateValue: string): string {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "Recently";

  const diffSeconds = Math.max(
    0,
    Math.floor((Date.now() - date.getTime()) / 1000),
  );
  if (diffSeconds < 60) return "Just now";
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes}${diffMinutes === 1 ? " minute" : " minutes"} ago`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}${diffHours === 1 ? " hour" : " hours"} ago`;
  }
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays}${diffDays === 1 ? " day" : " days"} ago`;
  }
  return date.toLocaleDateString();
}

function getExcerpt(item: WorkspaceDiscussionItem): string {
  const plainText = item.plainText.trim();
  if (plainText) return plainText;
  return item.content.replace(/\s+/g, " ").trim();
}

function getTitle(item: WorkspaceDiscussionItem, excerpt: string): string {
  const title = item.title?.trim();
  if (title) return title;
  return excerpt.split("\n", 1)[0]?.slice(0, 120) || "Untitled discussion";
}

export function adaptDiscussionWorkspaceItem(
  item: WorkspaceDiscussionItem,
  options?: { comments?: boolean; mentions?: boolean; notes?: boolean },
): DiscussionWorkspaceCard {
  const excerpt = getExcerpt(item);
  const isNote = options?.notes === true || item.kind === "note";
  const isMention = options?.mentions === true;
  const status =
    options?.comments || isMention || isNote
      ? undefined
      : item.status && item.status !== "all"
        ? item.status
        : "open";

  return {
    id: item.id,
    title:
      isNote || isMention
        ? item.title?.trim() || undefined
        : options?.comments
          ? item.title?.trim() || ""
          : getTitle(item, excerpt),
    excerpt,
    content: item.content,
    plainText: isNote || isMention ? item.plainText : excerpt,
    courseId: item.courseId,
    course: item.courseTitle?.trim() || "",
    courseTitle: item.courseTitle ?? null,
    lessonId: item.lessonId,
    lesson: item.lessonTitle?.trim() || "",
    lessonTitle: item.lessonTitle ?? null,
    parentThreadId: item.parentThreadId ?? null,
    parentThreadTitle: item.parentThreadTitle?.trim() || null,
    timestampSeconds: item.timestampSeconds ?? null,
    author: item.author.displayName || item.author.username,
    authorUsername: item.author.username?.trim() || "",
    avatar: item.author.avatarUrl ?? "",
    isOwn: item.isOwn === true,
    status,
    visibility: item.visibility,
    isLocked: item.isLocked,
    replies: item.repliesCount,
    likes: item.likesCount,
    isLiked: item.isLiked,
    isBookmarked: item.isBookmarked,
    isFollowing: item.isFollowing,
    isMentioned: item.isMentioned,
    activity: formatRelativeTime(item.updatedAt || item.createdAt),
    mentionedAt: item.mentionedAt,
    mentionActivity: item.mentionedAt
      ? formatRelativeTime(item.mentionedAt)
      : undefined,
    attachmentSummary: item.attachmentSummary,
    itemType: item.itemType,
    kind: item.kind,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}
