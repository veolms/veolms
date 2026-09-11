import type { Comment } from "./CommentCard";
import type { DiscussionEntryKind } from "./discussion-editor/types";

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

export function getDiscussionFeedCountLabel(
  filter: DiscussionEntryFilter,
  count: number,
): string {
  const noun =
    filter === "all"
      ? count === 1
        ? "Discussion"
        : "Discussions"
      : filter === "note"
        ? count === 1
          ? "Note"
          : "Notes"
        : filter === "question"
          ? count === 1
            ? "Q&A"
            : "Q&As"
          : count === 1
            ? "Comment"
            : "Comments";
  return `${count}\u00A0\u00A0${noun}`;
}

export interface InteractionCapabilities {
  allowComments: boolean;
  allowNotes: boolean;
  allowQa: boolean;
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
  return String(right.id).localeCompare(String(left.id));
}

export function applyDiscussionFeed({
  currentUserName,
  entries,
  filter,
  sort,
  capabilities,
}: {
  currentUserName: string;
  entries: readonly Comment[];
  filter: DiscussionEntryFilter;
  sort: DiscussionFeedSort;
  capabilities?: InteractionCapabilities;
}): Comment[] {
  const uniqueEntries = Array.from(
    new Map(entries.map((entry) => [entry.id, entry])).values(),
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

  return [...visibleEntries].sort((left, right) => {
    if (sort === "top") {
      return right.likes - left.likes || compareEntriesNewest(left, right);
    }
    return compareEntriesNewest(left, right);
  });
}
