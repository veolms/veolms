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

export function applyDiscussionFeed({
  currentUserName,
  entries,
  filter,
  sort,
}: {
  currentUserName: string;
  entries: readonly Comment[];
  filter: DiscussionEntryFilter;
  sort: DiscussionFeedSort;
}): Comment[] {
  const uniqueEntries = Array.from(
    new Map(entries.map((entry) => [entry.id, entry])).values(),
  );
  const typedEntries =
    filter === "all"
      ? uniqueEntries
      : uniqueEntries.filter(
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
      return right.likes - left.likes || right.id - left.id;
    }
    return right.id - left.id;
  });
}
