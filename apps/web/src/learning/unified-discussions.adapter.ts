import type { LessonDiscussionItem } from "@veolms/contracts";
import type { Comment } from "./CommentCard";
import { adaptLearningNoteToComment } from "./learning-notes.adapter";
import { adaptLearningThreadToComment } from "./learning-threads.adapter";
import {
  getClientEntityId,
  getServerEntityId,
  isClientEntityId,
  type LearningNoteCacheItem,
  type LearningThreadEntity,
} from "../services/learning-interactions/interaction-entities";

export type UnifiedDiscussionShadow =
  | LearningThreadEntity
  | LearningNoteCacheItem;

export function getUnifiedDiscussionIdentity(
  item: LessonDiscussionItem,
): string {
  return item.identity;
}

export function withSourceAwareIdentity(
  entry: Comment,
  sourceType: "thread" | "note",
  serverId: string,
): Comment {
  if (isClientEntityId(getClientEntityId(entry))) return entry;

  const identity = `${sourceType}:${serverId}`;
  return {
    ...entry,
    id: identity,
    clientId: identity,
    serverId,
    creationStatus: "confirmed",
  };
}

export function adaptUnifiedDiscussionItem(
  item: LessonDiscussionItem,
  authorName: string,
  authorAvatar: string,
  currentUserId: string | undefined,
  shadow?: UnifiedDiscussionShadow,
): Comment {
  const entry =
    item.sourceType === "thread"
      ? adaptLearningThreadToComment(
          (shadow && "kind" in shadow ? shadow : item.thread),
          currentUserId,
        )
      : adaptLearningNoteToComment(
          (shadow && "authorName" in shadow ? shadow : item.note),
          authorName,
          authorAvatar,
          currentUserId,
        );

  return withSourceAwareIdentity(entry, item.sourceType, item.entityId);
}

export function getDiscussionSourceType(
  entry: Comment,
): "thread" | "note" {
  return entry.entryKind === "note" ? "note" : "thread";
}

export function getUnifiedEntryIdentity(entry: Comment): string | undefined {
  const serverId = getServerEntityId(entry);
  return serverId
    ? `${getDiscussionSourceType(entry)}:${serverId}`
    : undefined;
}

export function orderUnifiedDiscussionEntries(
  items: readonly LessonDiscussionItem[],
  entries: readonly Comment[],
): Comment[] {
  const byIdentity = new Map(
    entries
      .map((entry) => [getUnifiedEntryIdentity(entry), entry] as const)
      .filter(
        (pair): pair is readonly [string, Comment] => Boolean(pair[0]),
      ),
  );
  const hydratedIdentities = new Set(items.map(getUnifiedDiscussionIdentity));
  const ordered = items
    .map((item) => byIdentity.get(getUnifiedDiscussionIdentity(item)))
    .filter((entry): entry is Comment => Boolean(entry));
  const localOnly = entries.filter((entry) => {
    const identity = getUnifiedEntryIdentity(entry);
    return !identity || !hydratedIdentities.has(identity);
  });

  return [...localOnly, ...ordered];
}
