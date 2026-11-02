import type { InfiniteData } from "@tanstack/react-query";
import { isInfiniteCacheData } from "./paginated-cache";
import {
  getClientEntityId,
  getServerEntityId,
  type LearningReplyCacheItem,
  type LearningRepliesCacheResponse,
} from "./interaction-entities";

type RepliesInfiniteData = InfiniteData<LearningRepliesCacheResponse>;

function isLocallyCreatedReply(reply: LearningReplyCacheItem): boolean {
  return "creationStatus" in reply && "localSequence" in reply;
}

function isPendingLocalReply(reply: LearningReplyCacheItem): boolean {
  return "creationStatus" in reply && reply.creationStatus === "pending";
}

function getReplySequence(reply: LearningReplyCacheItem): number {
  return "localSequence" in reply ? reply.localSequence : 0;
}

function getReplyCreatedAt(reply: LearningReplyCacheItem): number {
  const timestamp = Date.parse(reply.createdAt);
  return Number.isNaN(timestamp) ? Number.MIN_SAFE_INTEGER : timestamp;
}

function getReplyStableId(reply: LearningReplyCacheItem): string {
  return getServerEntityId(reply) ?? getClientEntityId(reply);
}

/**
 * Replies read as the conversation happened: an accepted answer first, then
 * the oldest reply first and the newest last, with one still being posted
 * at the very end, where it was written.
 */
function compareOldestFirst(
  left: LearningReplyCacheItem,
  right: LearningReplyCacheItem,
): number {
  const leftIsAccepted = Boolean(left.isAccepted);
  const rightIsAccepted = Boolean(right.isAccepted);
  if (leftIsAccepted !== rightIsAccepted) {
    return leftIsAccepted ? -1 : 1;
  }

  const leftIsLocal = isPendingLocalReply(left);
  const rightIsLocal = isPendingLocalReply(right);
  if (leftIsLocal !== rightIsLocal) {
    return leftIsLocal ? 1 : -1;
  }

  if (leftIsLocal && rightIsLocal) {
    const sequenceDifference = getReplySequence(left) - getReplySequence(right);
    if (sequenceDifference !== 0) return sequenceDifference;
  } else {
    const createdAtDifference =
      getReplyCreatedAt(left) - getReplyCreatedAt(right);
    if (createdAtDifference !== 0) return createdAtDifference;
  }

  return getReplyStableId(left).localeCompare(getReplyStableId(right));
}

export function flattenReplyPages(
  data: RepliesInfiniteData | LearningRepliesCacheResponse | undefined,
  threadId: string,
): LearningReplyCacheItem[] {
  const pages = isInfiniteCacheData<LearningRepliesCacheResponse>(data)
    ? data.pages
    : data
      ? [data]
      : [];
  const dedupedReplies: LearningReplyCacheItem[] = [];

  for (const page of pages) {
    for (const reply of page.replies) {
      const clientId = getClientEntityId(reply);
      const serverId = getServerEntityId(reply);
      const existingIndex = dedupedReplies.findIndex(
        (candidate) =>
          getClientEntityId(candidate) === clientId ||
          (serverId !== undefined && getServerEntityId(candidate) === serverId),
      );
      if (existingIndex >= 0) {
        const existing = dedupedReplies[existingIndex]!;
        const replyHasServerId = getServerEntityId(reply) !== undefined;
        const existingHasServerId = getServerEntityId(existing) !== undefined;
        if (
          (replyHasServerId && !existingHasServerId) ||
          (isLocallyCreatedReply(reply) && !isLocallyCreatedReply(existing))
        ) {
          dedupedReplies[existingIndex] = reply;
        }
        continue;
      }
      dedupedReplies.push(reply);
    }
  }

  return [...dedupedReplies].sort(compareOldestFirst);
}

export function getReplyTotalCount(
  data: RepliesInfiniteData | LearningRepliesCacheResponse | undefined,
): number | undefined {
  if (!data) return undefined;
  if (isInfiniteCacheData<LearningRepliesCacheResponse>(data)) {
    return data.pages[0]?.totalCount;
  }
  return data.totalCount;
}
