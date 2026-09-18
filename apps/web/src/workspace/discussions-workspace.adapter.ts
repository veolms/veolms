import type { WorkspaceDiscussionItem } from "@veolms/contracts";

export type DiscussionWorkspaceStatus =
  | "answered"
  | "mentioned"
  | "solved"
  | "open";

export interface DiscussionWorkspaceCard {
  id: string;
  title: string;
  excerpt: string;
  content: string;
  plainText: string;
  courseId: string;
  course: string;
  lessonId?: string;
  lesson: string;
  author: string;
  authorUsername: string;
  avatar: string;
  isOwn: boolean;
  status: DiscussionWorkspaceStatus;
  visibility?: WorkspaceDiscussionItem["visibility"];
  isLocked: boolean;
  replies: number;
  activity: string;
  attachmentSummary: WorkspaceDiscussionItem["attachmentSummary"];
  itemType: WorkspaceDiscussionItem["itemType"];
  kind: WorkspaceDiscussionItem["kind"];
}

function formatRelativeTime(dateValue: string): string {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "Recently";

  const diffSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
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
): DiscussionWorkspaceCard {
  const excerpt = getExcerpt(item);
  const status =
    item.status && item.status !== "all" ? item.status : "open";

  return {
    id: item.id,
    title: getTitle(item, excerpt),
    excerpt,
    content: item.content,
    plainText: excerpt,
    courseId: item.courseId,
    course: item.courseTitle?.trim() || "",
    ...(item.lessonId ? { lessonId: item.lessonId } : {}),
    lesson: item.lessonTitle?.trim() || "",
    author: item.author.displayName || item.author.username,
    authorUsername: item.author.username?.trim() || "",
    avatar: item.author.avatarUrl ?? "",
    isOwn: item.isOwn === true,
    status,
    visibility: item.visibility,
    isLocked: item.isLocked === true,
    replies: item.repliesCount,
    activity: formatRelativeTime(item.updatedAt || item.createdAt),
    attachmentSummary: item.attachmentSummary,
    itemType: item.itemType,
    kind: item.kind,
  };
}
