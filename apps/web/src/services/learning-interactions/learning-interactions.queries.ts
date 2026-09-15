import { useQuery } from "@tanstack/react-query";
import type {
  LearningNotesListResponse,
  LearningRepliesListResponse,
  ListLearningNotesQuery,
  ListLearningRepliesQuery,
  ListLearningThreadsQuery,
  ListReportsQuery,
  ReportsListResponse,
  UserAutocompleteQuery,
  UserAutocompleteResponse,
} from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { learningInteractionKeys } from "./learning-interactions.keys";
import { learningInteractionsService } from "./learning-interactions.service";
import { interactionCreationCoordinator } from "./interaction-creation-coordinator";
import { desiredStateCoordinator } from "./desired-state-coordinator";
import { calculateNextLikesCount } from "./cache-updaters";
import {
  toLearningThreadEntity,
  getClientEntityId,
  isClientEntityId,
  getServerEntityId,
  type LearningReplyCacheItem,
  type LearningRepliesCacheResponse,
  type LearningThreadCacheResponse,
  type LearningThreadEntity,
} from "./interaction-entities";
import type { ReplyCreationRecord } from "./interaction-creation-coordinator";

function getReplySequence(reply: LearningReplyCacheItem): number {
  return "localSequence" in reply
    ? reply.localSequence
    : Number.MAX_SAFE_INTEGER;
}

function matchesAcceptedReply(
  reply: LearningReplyCacheItem,
  desiredAcceptedReplyId: string | null,
): boolean {
  return (
    desiredAcceptedReplyId !== null &&
    (String(reply.id) === desiredAcceptedReplyId ||
      getClientEntityId(reply) === desiredAcceptedReplyId ||
      getServerEntityId(reply) === desiredAcceptedReplyId)
  );
}

function projectThreadLocalState(thread: LearningThreadEntity): LearningThreadEntity {
  const clientId = getClientEntityId(thread);
  const serverId = getServerEntityId(thread);
  const acceptedState = desiredStateCoordinator.getAcceptedAnswerState(
    serverId ?? clientId,
  );
  const desiredLiked = desiredStateCoordinator.getLikeProjection(
    "thread",
    clientId,
    serverId,
  );

  let next = thread;
  if (
    acceptedState &&
    next.acceptedAnswerId !== acceptedState.desiredAcceptedReplyId
  ) {
    next = {
      ...next,
      acceptedAnswerId: acceptedState.desiredAcceptedReplyId,
    };
  }
  if (desiredLiked !== undefined && Boolean(next.isLiked) !== desiredLiked) {
    next = {
      ...next,
      isLiked: desiredLiked,
      likesCount: calculateNextLikesCount(
        next.likesCount ?? 0,
        next.isLiked,
        desiredLiked,
      ),
    };
  }
  return next;
}

function projectReplyLocalState(
  reply: LearningReplyCacheItem,
  threadId: string,
): LearningReplyCacheItem {
  const clientId = getClientEntityId(reply);
  const serverId = getServerEntityId(reply);
  const acceptedState = desiredStateCoordinator.getAcceptedAnswerState(threadId);
  const desiredLiked = desiredStateCoordinator.getLikeProjection(
    "reply",
    clientId,
    serverId,
  );

  let next = reply;
  if (
    acceptedState &&
    Boolean(next.isAccepted) !==
      matchesAcceptedReply(next, acceptedState.desiredAcceptedReplyId)
  ) {
    next = {
      ...next,
      isAccepted: matchesAcceptedReply(
        next,
        acceptedState.desiredAcceptedReplyId,
      ),
    };
  }
  if (desiredLiked !== undefined && Boolean(next.isLiked) !== desiredLiked) {
    next = {
      ...next,
      isLiked: desiredLiked,
      likesCount: calculateNextLikesCount(
        next.likesCount ?? 0,
        next.isLiked,
        desiredLiked,
      ),
    };
  }
  return next;
}

export function mergeRepliesWithCreationRecords(
  response: LearningRepliesListResponse,
  threadId: string,
  records: readonly ReplyCreationRecord[],
): LearningRepliesCacheResponse {
  const replies: LearningReplyCacheItem[] = [...response.replies];
  let addedLocalReplies = 0;

  for (const record of records) {
    const localReply =
      record.status === "confirmed" && record.serverReply
        ? {
            ...record.serverReply,
            id: record.serverReply.id,
            threadId: record.serverReply.threadId,
            clientId: record.clientId,
            serverId: record.serverReply.id,
            creationStatus: "confirmed" as const,
            localSequence: record.localSequence,
          }
        : record.optimisticReply;
    const serverId = record.serverId ?? getServerEntityId(localReply);
    const existingIndex = serverId
      ? replies.findIndex((reply) => getServerEntityId(reply) === serverId)
      : -1;

    if (existingIndex >= 0) {
      replies[existingIndex] = {
        ...replies[existingIndex],
        ...localReply,
        clientId: record.clientId,
        serverId,
        creationStatus: "confirmed" as const,
        localSequence: record.localSequence,
      };
      continue;
    }

    replies.push(localReply);
    addedLocalReplies += 1;
  }

  replies.sort(
    (left, right) => getReplySequence(left) - getReplySequence(right),
  );
  const projectedReplies = replies.map((reply) =>
    projectReplyLocalState(reply, threadId),
  );
  return {
    ...response,
    replies: projectedReplies,
    totalCount:
      response.totalCount === undefined
        ? response.totalCount
        : response.totalCount + addedLocalReplies,
  };
}

export function useLessonThreads(
  courseId: string,
  lessonId: string,
  query?: ListLearningThreadsQuery,
  options?: { enabled?: boolean },
) {
  return useQuery<LearningThreadCacheResponse, ApiError>({
    queryKey: learningInteractionKeys.lessonThreads(courseId, lessonId, query),
    queryFn: async () => {
      const response = await learningInteractionsService.listLessonThreads(
        courseId,
        lessonId,
        query,
      );
      return {
        ...response,
        threads: response.threads.map((thread) =>
          projectThreadLocalState(toLearningThreadEntity(thread)),
        ),
      };
    },
    enabled: options?.enabled ?? Boolean(courseId && lessonId),
    staleTime: 30 * 1000,
  });
}

export function useHubThreads(
  query?: ListLearningThreadsQuery,
  options?: { enabled?: boolean },
) {
  return useQuery<LearningThreadCacheResponse, ApiError>({
    queryKey: learningInteractionKeys.hubThreads(query),
    queryFn: async () => {
      const response = await learningInteractionsService.listHubThreads(query);
      return {
        ...response,
        threads: response.threads.map((thread) =>
          projectThreadLocalState(toLearningThreadEntity(thread)),
        ),
      };
    },
    enabled: options?.enabled ?? true,
    staleTime: 30 * 1000,
  });
}

export function useThreadDetails(
  threadId: string | undefined,
  options?: { enabled?: boolean },
) {
  const isPendingClientId =
    isClientEntityId(threadId) ||
    interactionCreationCoordinator.hasPendingClientId(threadId);
  return useQuery<LearningThreadEntity, ApiError>({
    queryKey: learningInteractionKeys.threadDetails(threadId ?? ""),
    queryFn: async () => {
      if (!threadId || isPendingClientId) {
        throw new Error("A confirmed server thread ID is required.");
      }
      return projectThreadLocalState(
        toLearningThreadEntity(await learningInteractionsService.getThread(threadId)),
      );
    },
    enabled:
      (options?.enabled ?? Boolean(threadId)) &&
      Boolean(threadId) &&
      !isPendingClientId,
  });
}

export function useThreadReplies(
  threadId: string | undefined,
  query?: ListLearningRepliesQuery,
  options?: { enabled?: boolean },
) {
  return useQuery<LearningRepliesCacheResponse, ApiError>({
    queryKey: learningInteractionKeys.threadReplies(threadId ?? "", query),
    queryFn: async () => {
      if (
        !threadId ||
        isClientEntityId(threadId) ||
        interactionCreationCoordinator.hasPendingClientId(threadId)
      ) {
        throw new Error("A confirmed server thread ID is required.");
      }
      const response = await learningInteractionsService.listReplies(
        threadId,
        query,
      );
      return mergeRepliesWithCreationRecords(
        response,
        threadId,
        interactionCreationCoordinator.getActiveReplyRecords(threadId),
      );
    },
    enabled:
      (options?.enabled ?? Boolean(threadId)) &&
      Boolean(threadId) &&
      !isClientEntityId(threadId) &&
      !interactionCreationCoordinator.hasPendingClientId(threadId),
  });
}

export function useUserNotes(
  query?: ListLearningNotesQuery,
  options?: { enabled?: boolean },
) {
  return useQuery<LearningNotesListResponse, ApiError>({
    queryKey: learningInteractionKeys.notes(query),
    queryFn: () => learningInteractionsService.listNotes(query),
    enabled: options?.enabled ?? true,
  });
}

export function useUserAutocomplete(
  query: UserAutocompleteQuery,
  options?: { enabled?: boolean },
) {
  const searchTerm = query.query ?? query.q ?? "";
  return useQuery<UserAutocompleteResponse, ApiError>({
    queryKey: learningInteractionKeys.autocompleteUsers(
      query.courseId,
      searchTerm,
    ),
    queryFn: () => learningInteractionsService.autocompleteUsers(query),
    enabled:
      options?.enabled ?? Boolean(query.courseId && searchTerm.length >= 1),
    staleTime: 60 * 1000,
  });
}

export function useModerationReports(
  query?: ListReportsQuery,
  options?: { enabled?: boolean },
) {
  return useQuery<ReportsListResponse, ApiError>({
    queryKey: learningInteractionKeys.moderationReports(query),
    queryFn: () => learningInteractionsService.listReports(query),
    enabled: options?.enabled ?? true,
  });
}
