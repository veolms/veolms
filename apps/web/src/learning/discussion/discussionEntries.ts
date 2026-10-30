import type { Comment } from "../CommentCard";
import {
  isDiscussionContent,
  type DiscussionEntryKind,
  type DiscussionVisibility,
} from "../discussion-editor/types";
import {
  getClientEntityId,
  getServerEntityId,
} from "../../services/learning-interactions/interaction-entities";

export const CURRENT_USER = {
  name: "Ashi Singh",
  avatar: "",
};

export function getCachedInteractionItems<T>(
  data: unknown,
  key: "notes" | "threads",
): T[] {
  if (!data || typeof data !== "object") return [];
  const cache = data as Record<string, unknown>;
  const pages = Array.isArray(cache.pages) ? cache.pages : [cache];
  return pages.flatMap((page) => {
    if (!page || typeof page !== "object") return [];
    const items = (page as Record<string, unknown>)[key];
    return Array.isArray(items) ? (items as T[]) : [];
  });
}

function getThreadIdentityValues(entry: Comment): string[] {
  return Array.from(
    new Set(
      [
        entry.clientId,
        entry.serverId,
        String(entry.id),
        getServerEntityId(entry),
      ].filter((value): value is string => Boolean(value)),
    ),
  );
}

export function threadEntriesShareIdentity(
  first: Comment,
  second: Comment,
): boolean {
  const secondIdentityValues = new Set(getThreadIdentityValues(second));
  return getThreadIdentityValues(first).some((value) =>
    secondIdentityValues.has(value),
  );
}

export function mergeDirectThreadCommentIdentity(
  existing: Comment,
  incoming: Comment,
): Comment {
  const clientId = getClientEntityId(existing);
  return {
    ...incoming,
    id: clientId,
    clientId,
    serverId: getServerEntityId(incoming) ?? getServerEntityId(existing),
  };
}

export const initialEntries: Comment[] = [
  {
    id: 4,
    name: "Rohit Sharma",
    time: "2 hours ago",
    avatar: "/static/ethan-avatar-160.webp",
    text: "Great explanation! The way you broke down the design process makes it so much easier to understand. Especially the part about user empathy — super insightful!",
    entryKind: "comment",
    likes: 24,
    replies: 2,
    repliesExpanded: true,
    thread: [
      {
        id: 401,
        name: "Ashi Singh",
        time: "1 hour ago",
        avatar: "/static/sofia-avatar-160.webp",
        text: "Thank you so much, Rohit! Really glad it helped.",
        likes: 12,
      },
      {
        id: 402,
        name: "Karan Mehta",
        time: "45 minutes ago",
        avatar: "/static/ethan-avatar-160.webp",
        text: "Totally agree! The empathy part clicked for me too.",
        likes: 5,
      },
    ],
  },
  {
    id: 3,
    name: "Neha Patel",
    time: "3 hours ago",
    avatar: "/static/sofia-avatar-160.webp",
    text: "Can you share some real-world examples of this process?",
    entryKind: "question",
    likes: 18,
    replies: 1,
    isQuestion: true,
    thread: [
      {
        id: 301,
        name: "Ashi Singh",
        time: "2 hours ago",
        avatar: "/static/sofia-avatar-160.webp",
        text: "Absolutely — I’ll add a few examples from product discovery and usability testing.",
        likes: 7,
      },
    ],
  },
  {
    id: 1,
    name: "Vivek Nair",
    time: "1 day ago",
    avatar: "/static/ethan-avatar-160.webp",
    text: "How do you know when you have enough user interviews to start mapping patterns?",
    entryKind: "question",
    likes: 11,
    replies: 1,
    isQuestion: true,
    thread: [
      {
        id: 101,
        name: "Karan Mehta",
        time: "21 hours ago",
        avatar: "/static/ethan-avatar-160.webp",
        text: "When the same themes repeat and new interviews stop changing the shape of the problem.",
        likes: 7,
      },
    ],
  },
];

const isDiscussionEntryKind = (value: unknown): value is DiscussionEntryKind =>
  value === "comment" || value === "question" || value === "note";

const isDiscussionVisibility = (
  value: unknown,
): value is DiscussionVisibility =>
  value === "public" || value === "private" || value === "unlisted";

export const getAllowedVisibility = (
  entryKind: DiscussionEntryKind,
  visibility: DiscussionVisibility,
): DiscussionVisibility =>
  entryKind !== "note" && visibility === "private" ? "public" : visibility;

const NOTE_DEEP_LINK_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidNoteDeepLinkId(value: string | null): value is string {
  return Boolean(value && NOTE_DEEP_LINK_ID_PATTERN.test(value));
}

export const isStoredEntries = (value: unknown): value is Comment[] =>
  Array.isArray(value) &&
  value.every(
    (entry) =>
      Boolean(entry) &&
      typeof entry === "object" &&
      (typeof (entry as Comment).id === "number" ||
        typeof (entry as Comment).id === "string") &&
      typeof (entry as Comment).name === "string" &&
      typeof (entry as Comment).time === "string" &&
      typeof (entry as Comment).avatar === "string" &&
      typeof (entry as Comment).text === "string" &&
      typeof (entry as Comment).likes === "number" &&
      (typeof (entry as Comment).entryKind === "undefined" ||
        isDiscussionEntryKind((entry as Comment).entryKind)) &&
      (typeof (entry as Comment).content === "undefined" ||
        isDiscussionContent((entry as Comment).content)) &&
      (typeof (entry as Comment).visibility === "undefined" ||
        isDiscussionVisibility((entry as Comment).visibility)) &&
      (typeof (entry as Comment).liked === "undefined" ||
        typeof (entry as Comment).liked === "boolean") &&
      (typeof (entry as Comment).isBookmarked === "undefined" ||
        typeof (entry as Comment).isBookmarked === "boolean") &&
      (typeof (entry as Comment).isFollowing === "undefined" ||
        typeof (entry as Comment).isFollowing === "boolean") &&
      (typeof (entry as Comment).isOwn === "undefined" ||
        typeof (entry as Comment).isOwn === "boolean"),
  );
