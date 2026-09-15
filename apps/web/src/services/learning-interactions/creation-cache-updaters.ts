import type { QueryClient } from "@tanstack/react-query";
import type { LearningThread } from "@veolms/contracts";
import { learningInteractionKeys } from "./learning-interactions.keys";
import {
  getClientEntityId,
  getServerEntityId,
  isLearningThreadEntity,
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
