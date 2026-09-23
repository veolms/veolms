import type { Comment } from "./CommentCard";
import type { DiscussionEntryKind } from "./discussion-editor/types";
import { getClientEntityId } from "../services/learning-interactions/interaction-entities";
import type { LessonInteractionCounts } from "../services/learning-interactions";

export type DiscussionEntryFilter = "all" | DiscussionEntryKind;
export type DiscussionFeedSort = "newest" | "top" | "mine";

export const DISCUSSION_FEED_SORT_OPTIONS = [
  ["newest", "Newest"],
  ["top", "Top"],
  ["mine", "Mine"],
] as const satisfies readonly (readonly [DiscussionFeedSort, string])[];

export function getDiscussionEntryKind(entry: Comment): DiscussionEntryKind {
  return entry.entryKind ?? (entry.isQuestion ? "question" : "comment");
}

export function isOwnDiscussionEntry(
  entry: Comment,
  currentUserName: string,
): boolean {
  return Boolean(entry.isOwn) || entry.name === currentUserName;
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

export function applyDiscussionFeed({
  currentUserName,
  entries,
  filter,
  sort,
  capabilities,
  preserveOrder = false,
}: {
  currentUserName: string;
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
  const visibleEntries =
    sort === "mine"
      ? typedEntries.filter((entry) =>
          isOwnDiscussionEntry(entry, currentUserName),
        )
      : typedEntries;

  if (preserveOrder) return visibleEntries;

  return [...visibleEntries].sort((left, right) => {
    if (sort === "top") {
      return right.likes - left.likes || compareEntriesNewest(left, right);
    }
    return compareEntriesNewest(left, right);
  });
}
