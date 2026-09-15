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
import {
  toLearningThreadEntity,
  isClientEntityId,
  type LearningThreadCacheResponse,
  type LearningThreadEntity,
} from "./interaction-entities";

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
          toLearningThreadEntity(thread),
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
          toLearningThreadEntity(thread),
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
      return toLearningThreadEntity(
        await learningInteractionsService.getThread(threadId),
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
  return useQuery<LearningRepliesListResponse, ApiError>({
    queryKey: learningInteractionKeys.threadReplies(threadId ?? "", query),
    queryFn: async () => {
      if (
        !threadId ||
        (isClientEntityId(threadId) ||
          interactionCreationCoordinator.hasPendingClientId(threadId))
      ) {
        throw new Error("A confirmed server thread ID is required.");
      }
      return learningInteractionsService.listReplies(threadId, query);
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
