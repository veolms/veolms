import type { QueryClient } from "@tanstack/react-query";
import type { LearningReply, LearningThread } from "@veolms/contracts";
import { learningInteractionKeys } from "./learning-interactions.keys";
import {
  getClientEntityId,
  getServerEntityId,
  isLearningThreadEntity,
  type LearningReplyCacheItem,
  type LearningReplyEntity,
  type LearningRepliesCacheResponse,
  type LearningThreadCacheResponse,
  type LearningThreadEntity,
} from "./interaction-entities";

export interface LessonThreadCacheContext {
  courseId: string;
  lessonId: string;
}

const lessonThreadQueryPrefix = (context: LessonThreadCacheContext) =>
  [
    ...learningInteractionKeys.all,
    "lesson-threads",
    context.courseId,
    context.lessonId,
  ] as const;

const replyQueryPrefix = (parentId: string) =>
  learningInteractionKeys.threadRepliesRoot(parentId);

function getReplyClientId(reply: LearningReplyCacheItem): string {
  return getClientEntityId(reply);
}

function getReplyServerId(reply: LearningReplyCacheItem): string | undefined {
  return getServerEntityId(reply);
}

function getReplySequence(reply: LearningReplyCacheItem): number {
  return "localSequence" in reply ? reply.localSequence : Number.MAX_SAFE_INTEGER;
}

function sortReplies(replies: LearningReplyCacheItem[]): LearningReplyCacheItem[] {
  return [...replies].sort((left, right) => {
    return getReplySequence(left) - getReplySequence(right);
  });
}

function setReplyCaches(
  queryClient: QueryClient,
  parentId: string,
  updater: (old: LearningRepliesCacheResponse | undefined) =>
    | LearningRepliesCacheResponse
    | undefined,
): boolean {
  let changedExistingCache = false;
  queryClient.setQueriesData<LearningRepliesCacheResponse>(
    { queryKey: replyQueryPrefix(parentId) },
    (old) => {
      const next = updater(old);
      if (next !== old) changedExistingCache = true;
      return next;
    },
  );
  return changedExistingCache;
}

export function updateReplyCountInThreadCaches(
  queryClient: QueryClient,
  parentId: string,
  delta: number,
): void {
  queryClient.setQueryData<LearningThread>(
    learningInteractionKeys.threadDetails(parentId),
    (old) =>
      old
        ? { ...old, repliesCount: Math.max(0, (old.repliesCount ?? 0) + delta) }
        : old,
  );

  const updateThreadLists = (old: {
    threads: Array<LearningThread | LearningThreadEntity>;
    nextCursor: string | null;
    totalCount?: number;
  } | undefined) => {
    if (!old?.threads) return old;
    let changed = false;
    const threads = old.threads.map((thread) => {
      if (
        getClientEntityId(thread) !== parentId &&
        getServerEntityId(thread) !== parentId
      ) {
        return thread;
      }
      changed = true;
      return {
        ...thread,
        repliesCount: Math.max(0, (thread.repliesCount ?? 0) + delta),
      };
    });
    return changed ? { ...old, threads } : old;
  };

  queryClient.setQueriesData<{
    threads: Array<LearningThread | LearningThreadEntity>;
    nextCursor: string | null;
    totalCount?: number;
  }>({ queryKey: [...learningInteractionKeys.all, "lesson-threads"] }, updateThreadLists);
  queryClient.setQueriesData<{
    threads: Array<LearningThread | LearningThreadEntity>;
    nextCursor: string | null;
    totalCount?: number;
  }>({ queryKey: [...learningInteractionKeys.all, "hub-threads"] }, updateThreadLists);
}

export function insertOptimisticReplyInCaches(
  queryClient: QueryClient,
  parentId: string,
  reply: LearningReplyEntity,
): boolean {
  let inserted = false;
  const changedExistingCache = setReplyCaches(queryClient, parentId, (old) => {
    if (!old) return old;
    if (old.replies.some((item) => getReplyClientId(item) === reply.clientId)) {
      return old;
    }
    inserted = true;
    return {
      ...old,
      replies: sortReplies([...old.replies, reply]),
      totalCount:
        old.totalCount === undefined ? old.totalCount : old.totalCount + 1,
    };
  });

  if (!changedExistingCache) {
    queryClient.setQueryData<LearningRepliesCacheResponse>(
      learningInteractionKeys.threadReplies(parentId, undefined),
      (old) => {
        if (old?.replies.some((item) => getReplyClientId(item) === reply.clientId)) {
          return old;
        }
        inserted = true;
        return {
          ...(old ?? { nextCursor: null }),
          replies: sortReplies([...(old?.replies ?? []), reply]),
          totalCount:
            old?.totalCount === undefined ? old?.totalCount : old.totalCount + 1,
        };
      },
    );
  }
  if (inserted) updateReplyCountInThreadCaches(queryClient, parentId, 1);
  return inserted;
}

export function migrateOptimisticRepliesToServerParent(
  queryClient: QueryClient,
  parentClientId: string,
  parentServerId: string,
): void {
  const pendingEntries = queryClient.getQueriesData<LearningRepliesCacheResponse>({
    queryKey: replyQueryPrefix(parentClientId),
  });
  for (const [pendingKey, pendingData] of pendingEntries) {
    if (!pendingData) continue;
    const suffix = pendingKey.slice(replyQueryPrefix(parentClientId).length);
    const serverKey = [...replyQueryPrefix(parentServerId), ...suffix];
    queryClient.setQueryData<LearningRepliesCacheResponse>(serverKey, (old) => {
      const replies = [...(old?.replies ?? [])];
      for (const reply of pendingData.replies) {
        if (
          !replies.some(
            (candidate) =>
              getReplyClientId(candidate) === getReplyClientId(reply) ||
              (getReplyServerId(candidate) !== undefined &&
                getReplyServerId(candidate) === getReplyServerId(reply)),
          )
        ) {
          replies.push(reply);
        }
      }
      return {
        ...(old ?? { nextCursor: null }),
        replies: sortReplies(replies),
      };
    });
    queryClient.removeQueries({ queryKey: pendingKey, exact: true });
  }
}

export function reconcileOptimisticReplyInCaches(
  queryClient: QueryClient,
  parentServerId: string,
  clientId: string,
  serverReply: LearningReply,
): void {
  const confirmedReply: LearningReplyEntity = {
    ...serverReply,
    id: serverReply.id,
    threadId: serverReply.threadId,
    clientId,
    serverId: serverReply.id,
    creationStatus: "confirmed",
    localSequence: Number.MAX_SAFE_INTEGER,
  };
  const changedExistingCache = setReplyCaches(queryClient, parentServerId, (old) => {
    if (!old) return old;
    const existingIndex = old.replies.findIndex(
      (reply) =>
        getReplyClientId(reply) === clientId ||
        getReplyServerId(reply) === serverReply.id,
    );
    if (existingIndex < 0) {
      return { ...old, replies: sortReplies([...old.replies, confirmedReply]) };
    }
    const replies = [...old.replies];
    const existing = replies[existingIndex]!;
    replies[existingIndex] = {
      ...confirmedReply,
      localSequence: getReplySequence(existing),
    };
    return { ...old, replies: sortReplies(replies) };
  });
  if (!changedExistingCache) {
    queryClient.setQueryData<LearningRepliesCacheResponse>(
      learningInteractionKeys.threadReplies(parentServerId, undefined),
      (old) => ({
        ...(old ?? { nextCursor: null }),
        replies: sortReplies([...(old?.replies ?? []), confirmedReply]),
      }),
    );
  }
}

export function removeOptimisticReplyFromCaches(
  queryClient: QueryClient,
  parentId: string,
  clientId: string,
): void {
  let removed = false;
  setReplyCaches(queryClient, parentId, (old) => {
    if (!old) return old;
    const replies = old.replies.filter((reply) => getReplyClientId(reply) !== clientId);
    if (replies.length === old.replies.length) return old;
    removed = true;
    return {
      ...old,
      replies,
      totalCount:
        old.totalCount === undefined ? old.totalCount : Math.max(0, old.totalCount - 1),
    };
  });
  if (removed) updateReplyCountInThreadCaches(queryClient, parentId, -1);
}

function asThreadEntity(
  thread: LearningThread | LearningThreadEntity,
): LearningThreadEntity {
  if (isLearningThreadEntity(thread)) return thread;
  return {
    ...thread,
    id: thread.id,
    clientId: thread.id,
    serverId: thread.id,
    creationStatus: "confirmed",
  };
}

function isPendingThreadForClient(
  thread: LearningThread | LearningThreadEntity,
  clientId: string,
): boolean {
  return getClientEntityId(thread) === clientId;
}

function hasServerThread(
  thread: LearningThread | LearningThreadEntity,
  serverId: string,
): boolean {
  return getServerEntityId(thread) === serverId;
}

function setLessonThreadCaches(
  queryClient: QueryClient,
  context: LessonThreadCacheContext,
  updater: (
    old: LearningThreadCacheResponse | undefined,
  ) => LearningThreadCacheResponse | undefined,
): boolean {
  let changedExistingCache = false;
  queryClient.setQueriesData<LearningThreadCacheResponse>(
    { queryKey: lessonThreadQueryPrefix(context) },
    (old) => {
      const next = updater(old);
      if (next !== old) changedExistingCache = true;
      return next;
    },
  );
  return changedExistingCache;
}

export function insertOptimisticThreadInLessonCaches(
  queryClient: QueryClient,
  context: LessonThreadCacheContext,
  optimisticThread: LearningThreadEntity,
): void {
  const changedExistingCache = setLessonThreadCaches(
    queryClient,
    context,
    (old) => {
      if (!old?.threads) return old;
      if (
        old.threads.some(
          (thread) => getClientEntityId(thread) === optimisticThread.clientId,
        )
      ) {
        return old;
      }
      return {
        ...old,
        threads: [optimisticThread, ...old.threads.map(asThreadEntity)],
      };
    },
  );

  if (!changedExistingCache) {
    queryClient.setQueryData<LearningThreadCacheResponse>(
      learningInteractionKeys.lessonThreads(
        context.courseId,
        context.lessonId,
        { kind: "all", status: "all", sort: "latest", limit: 100 },
      ),
      (old) => {
        if (
          old?.threads?.some(
            (thread) => getClientEntityId(thread) === optimisticThread.clientId,
          )
        )
          return old;
        return {
          ...(old ?? { nextCursor: null }),
          threads: [
            optimisticThread,
            ...(old?.threads ?? []).map(asThreadEntity),
          ],
        };
      },
    );
  }
}

export function reconcileOptimisticThreadInLessonCaches(
  queryClient: QueryClient,
  context: LessonThreadCacheContext,
  clientId: string,
  serverThread: LearningThread,
): void {
  const confirmedThread = {
    ...serverThread,
    id: serverThread.id,
    clientId,
    serverId: serverThread.id,
    creationStatus: "confirmed" as const,
  };

  const changedExistingCache = setLessonThreadCaches(
    queryClient,
    context,
    (old) => {
      if (!old?.threads) return old;
      const hasPending = old.threads.some((thread) =>
        isPendingThreadForClient(thread, clientId),
      );
      const hasConfirmed = old.threads.some((thread) =>
        hasServerThread(thread, serverThread.id),
      );
      if (!hasPending && !hasConfirmed) return old;

      const withoutPending = old.threads.filter(
        (thread) => !isPendingThreadForClient(thread, clientId),
      );
      if (hasConfirmed) {
        return {
          ...old,
          threads: withoutPending.map((thread) =>
            hasServerThread(thread, serverThread.id)
              ? confirmedThread
              : asThreadEntity(thread),
          ),
        };
      }

      const pendingIndex = old.threads.findIndex((thread) =>
        isPendingThreadForClient(thread, clientId),
      );
      const nextThreads = withoutPending.map(asThreadEntity);
      nextThreads.splice(Math.max(0, pendingIndex), 0, confirmedThread);
      return { ...old, threads: nextThreads };
    },
  );

  if (!changedExistingCache) {
    queryClient.setQueryData<LearningThreadCacheResponse>(
      learningInteractionKeys.lessonThreads(
        context.courseId,
        context.lessonId,
        { kind: "all", status: "all", sort: "latest", limit: 100 },
      ),
      (old) => {
        if (!old?.threads) return old;
        if (
          old.threads.some((thread) => hasServerThread(thread, serverThread.id))
        )
          return old;
        return {
          ...old,
          threads: [...old.threads.map(asThreadEntity), confirmedThread],
        };
      },
    );
  }
}

export function removeOptimisticThreadFromLessonCaches(
  queryClient: QueryClient,
  context: LessonThreadCacheContext,
  clientId: string,
): void {
  setLessonThreadCaches(queryClient, context, (old) => {
    if (!old?.threads) return old;
    const threads = old.threads.filter(
      (thread) => !isPendingThreadForClient(thread, clientId),
    );
    return threads.length === old.threads.length ? old : { ...old, threads };
  });
}
