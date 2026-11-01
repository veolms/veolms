import type { WorkspaceDiscussionItem } from "@veolms/contracts";
import { formatTimeAgo } from "../lib/timeAgo";

export type DiscussionWorkspaceStatus =
  "answered" | "mentioned" | "solved" | "open";

export interface DiscussionWorkspaceCard {
  workspaceItem: WorkspaceDiscussionItem;
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
  isBookmarked?: boolean;
  isFollowing?: boolean;
  isLiked?: boolean;
  /** When `activity` happened, for its exact-time tooltip. */
  activityAt: string;
  activity: string;
  mentionedAt?: string;
  mentionActivity?: string;
  attachmentSummary: WorkspaceDiscussionItem["attachmentSummary"];
  itemType: WorkspaceDiscussionItem["itemType"];
  kind: WorkspaceDiscussionItem["kind"];
  createdAt: string;
  updatedAt: string;
  bookmarkedAt?: string;
  bookmarkActivity?: string;
}

function formatRelativeTime(dateValue: string): string {
  return formatTimeAgo(dateValue) || "Recently";
}

function getExcerpt(item: WorkspaceDiscussionItem): string {
  const plainText = item.plainText.trim();
  if (plainText) return plainText;
  return item.content.replace(/\s+/g, " ").trim();
}

export function adaptDiscussionWorkspaceItem(
  item: WorkspaceDiscussionItem,
  options?: {
    comments?: boolean;
    mentions?: boolean;
    notes?: boolean;
    following?: boolean;
    bookmarks?: boolean;
  },
): DiscussionWorkspaceCard {
  const excerpt = getExcerpt(item);
  const isNote = options?.notes === true || item.kind === "note";
  const isMention = options?.mentions === true;
  const isFollowing = options?.following === true;
  const isBookmark = options?.bookmarks === true;
  const isQuestion = item.kind === "question" || item.kind === "qna";
  const status =
    options?.comments ||
    isMention ||
    isNote ||
    isFollowing ||
    (isBookmark && !isQuestion)
      ? undefined
      : isBookmark
        ? item.status && item.status !== "all"
          ? item.status
          : undefined
        : item.status && item.status !== "all"
          ? item.status
          : "open";

  return {
    workspaceItem: item,
    id: item.id,
    title: item.title?.trim() || undefined,
    excerpt,
    content: item.content,
    plainText:
      isNote || isMention || isFollowing || isBookmark
        ? item.plainText
        : excerpt,
    courseId: item.courseId,
    course: item.courseTitle?.trim() || "",
    courseTitle: item.courseTitle ?? null,
    lessonId: item.lessonId,
    // "12. Lesson name": the lesson's number across the whole course.
    lesson:
      item.lessonTitle?.trim() && item.lessonNumber
        ? `${item.lessonNumber}. ${item.lessonTitle.trim()}`
        : item.lessonTitle?.trim() || "",
    lessonTitle: item.lessonTitle ?? null,
    parentThreadId: item.parentThreadId ?? null,
    parentThreadTitle: item.parentThreadTitle?.trim() || null,
    timestampSeconds: item.timestampSeconds ?? null,
    author: item.author.displayName || item.author.username || "",
    authorUsername: item.author.username?.trim() || "",
    avatar: item.author.avatarUrl ?? "",
    isOwn: item.isOwn === true,
    status,
    visibility: item.visibility,
    isLocked: item.isLocked,
    replies: item.repliesCount,
    likes: item.likesCount,
    isBookmarked: item.isBookmarked,
    isLiked: item.isLiked,
    isFollowing: item.isFollowing,
    activityAt: isFollowing ? item.updatedAt : item.updatedAt || item.createdAt,
    activity: formatRelativeTime(
      isFollowing ? item.updatedAt : item.updatedAt || item.createdAt,
    ),
    mentionedAt: item.mentionedAt,
    mentionActivity: item.mentionedAt
      ? formatRelativeTime(item.mentionedAt)
      : undefined,
    bookmarkedAt: item.bookmarkedAt,
    bookmarkActivity: item.bookmarkedAt
      ? formatRelativeTime(item.bookmarkedAt)
      : undefined,
    attachmentSummary: item.attachmentSummary,
    itemType: item.itemType,
    kind: item.kind,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}
