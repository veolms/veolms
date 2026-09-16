import type { InfiniteData } from "@tanstack/react-query";
import { isInfiniteCacheData } from "./paginated-cache";
import {
  getClientEntityId,
  getServerEntityId,
  type LearningReplyCacheItem,
  type LearningRepliesCacheResponse,
} from "./interaction-entities";

type RepliesInfiniteData = InfiniteData<LearningRepliesCacheResponse>;

function getReplySequence(reply: LearningReplyCacheItem): number {
  return "localSequence" in reply
    ? reply.localSequence
    : Number.MAX_SAFE_INTEGER;
}

function isLocallyCreatedReply(reply: LearningReplyCacheItem): boolean {
  return "creationStatus" in reply && "localSequence" in reply;
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
        if (isLocallyCreatedReply(reply) && !isLocallyCreatedReply(existing)) {
          dedupedReplies[existingIndex] = reply;
        }
        continue;
      }
      dedupedReplies.push(reply);
    }
  }

  const serverReplies = dedupedReplies.filter(
    (reply) => !isLocallyCreatedReply(reply),
  );
  const localReplies = dedupedReplies.filter(isLocallyCreatedReply);
  localReplies.sort(
    (left, right) => getReplySequence(left) - getReplySequence(right),
  );
  return [...serverReplies, ...localReplies];
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
