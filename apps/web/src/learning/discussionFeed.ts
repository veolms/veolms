import type { Comment } from "./CommentCard";
import type { DiscussionEntryKind } from "./discussion-editor/types";
import { getClientEntityId } from "../services/learning-interactions/interaction-entities";
import type { LessonInteractionCounts } from "../services/learning-interactions";

export type DiscussionEntryFilter = "all" | DiscussionEntryKind;
export type DiscussionFeedSort = "newest" | "oldest" | "top";

/**
 * What the feed's menu offers: the orders, and "mine", which is the
 * newest first of only what the learner posted themselves (named after the
 * tab: "My Comments", "My Notes" and so on).
 */
export type DiscussionFeedView = DiscussionFeedSort | "mine";

/**
 * Top comes first and is where a lesson's discussions open: the most liked,
 * and among equally liked ones the oldest (the first things said about the
 * lesson). It is the order the lesson's page is built with, so the list the
 * page shows at once is the one it keeps.
 */
export const DISCUSSION_FEED_SORT_OPTIONS = [
  ["top", "Top"],
  ["newest", "Newest"],
  ["oldest", "Oldest"],
] as const satisfies readonly (readonly [DiscussionFeedView, string])[];

const MINE_LABELS: Record<DiscussionEntryFilter, string> = {
  all: "My Discussions",
  comment: "My Comments",
  note: "My Notes",
  question: "My Q&As",
};

/**
 * With the learner's own, named after the tab, for a learner who is signed
 * in: a guest has posted nothing.
 */
export const getDiscussionFeedViewOptions = (
  entryFilter: DiscussionEntryFilter,
): readonly (readonly [DiscussionFeedView, string])[] => [
  ...DISCUSSION_FEED_SORT_OPTIONS,
  ["mine", MINE_LABELS[entryFilter]],
];

export const getDiscussionFeedSort = (
  view: DiscussionFeedView,
): DiscussionFeedSort =>
  view === "top" ? "top" : view === "oldest" ? "oldest" : "newest";

export function getDiscussionEntryKind(entry: Comment): DiscussionEntryKind {
  return entry.entryKind ?? (entry.isQuestion ? "question" : "comment");
}

export interface InteractionCapabilities {
  allowComments: boolean;
  allowNotes: boolean;
  allowQa: boolean;
}

export function getDiscussionCountForFilter(
  counts: LessonInteractionCounts,
  filter: DiscussionEntryFilter,
): number {
  if (filter === "comment") return counts.comments;
  if (filter === "note") return counts.notes;
  if (filter === "question") return counts.qna;
  return counts.total;
}

export function getEntryTimestamp(entry: Comment): number {
  if (entry.createdAt !== undefined) {
    const parsed =
      typeof entry.createdAt === "number"
        ? entry.createdAt
        : Date.parse(entry.createdAt);
    if (!Number.isNaN(parsed)) return parsed;
  }
  if (typeof entry.id === "number") return entry.id;
  return 0;
}

export function compareEntriesNewest(left: Comment, right: Comment): number {
  const diff = getEntryTimestamp(right) - getEntryTimestamp(left);
  if (diff !== 0) return diff;
  return getClientEntityId(right).localeCompare(getClientEntityId(left));
}

export function compareEntriesForSort(
  left: Comment,
  right: Comment,
  sort: DiscussionFeedSort,
): number {
  if (sort === "top") {
    return right.likes - left.likes || compareEntriesNewest(left, right);
  }
  if (sort === "oldest") return compareEntriesNewest(right, left);
  return compareEntriesNewest(left, right);
}

export function applyDiscussionFeed({
  entries,
  filter,
  sort,
  capabilities,
  preserveOrder = false,
}: {
  entries: readonly Comment[];
  filter: DiscussionEntryFilter;
  sort: DiscussionFeedSort;
  capabilities?: InteractionCapabilities;
  preserveOrder?: boolean;
}): Comment[] {
  const uniqueEntries = Array.from(
    new Map(entries.map((entry) => [getClientEntityId(entry), entry])).values(),
  );
  const capabilityFiltered = capabilities
    ? uniqueEntries.filter((entry) => {
        const kind = getDiscussionEntryKind(entry);
        if (kind === "comment" && !capabilities.allowComments) return false;
        if (kind === "note" && !capabilities.allowNotes) return false;
        if (kind === "question" && !capabilities.allowQa) return false;
        return true;
      })
    : uniqueEntries;
  const typedEntries =
    filter === "all"
      ? capabilityFiltered
      : capabilityFiltered.filter(
          (entry) => getDiscussionEntryKind(entry) === filter,
        );
  const visibleEntries = typedEntries;

  if (preserveOrder) return visibleEntries;

  return [...visibleEntries].sort((left, right) =>
    compareEntriesForSort(left, right, sort),
  );
}
