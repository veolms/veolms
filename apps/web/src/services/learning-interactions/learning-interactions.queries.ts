import { useQuery } from "@tanstack/react-query";
import type {
  LearningNotesListResponse,
  LearningRepliesListResponse,
  LearningThread,
  LearningThreadsListResponse,
  ListLearningNotesQuery,
  ListLearningRepliesQuery,
  ListLearningThreadsQuery,
  ListReportsQuery,
  ReportsListResponse,
  SearchMentionsResponse,
} from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { learningInteractionKeys } from "./learning-interactions.keys";
import { learningInteractionsService } from "./learning-interactions.service";

export function useLessonThreads(
  courseId: string,
  lessonId: string,
  query?: ListLearningThreadsQuery,
  options?: { enabled?: boolean },
) {
  return useQuery<LearningThreadsListResponse, ApiError>({
    queryKey: learningInteractionKeys.lessonThreads(courseId, lessonId, query),
    queryFn: () =>
      learningInteractionsService.listLessonThreads(courseId, lessonId, query),
    enabled: options?.enabled ?? Boolean(courseId && lessonId),
    staleTime: 30 * 1000,
  });
}

export function useHubThreads(
  query?: ListLearningThreadsQuery,
  options?: { enabled?: boolean },
) {
  return useQuery<LearningThreadsListResponse, ApiError>({
    queryKey: learningInteractionKeys.hubThreads(query),
    queryFn: () => learningInteractionsService.listHubThreads(query),
    enabled: options?.enabled ?? true,
    staleTime: 30 * 1000,
  });
}

export function useThreadDetails(
  threadId: string,
  options?: { enabled?: boolean },
) {
  return useQuery<LearningThread, ApiError>({
    queryKey: learningInteractionKeys.threadDetails(threadId),
    queryFn: () => learningInteractionsService.getThread(threadId),
    enabled: options?.enabled ?? Boolean(threadId),
  });
}

export function useThreadReplies(
  threadId: string,
  query?: ListLearningRepliesQuery,
  options?: { enabled?: boolean },
) {
  return useQuery<LearningRepliesListResponse, ApiError>({
    queryKey: learningInteractionKeys.threadReplies(threadId),
    queryFn: () => learningInteractionsService.listReplies(threadId, query),
    enabled: options?.enabled ?? Boolean(threadId),
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

export function useMentionsSearch(query: string, options?: { enabled?: boolean }) {
  return useQuery<SearchMentionsResponse, ApiError>({
    queryKey: learningInteractionKeys.mentions(query),
    queryFn: () => learningInteractionsService.searchMentions(query),
    enabled: options?.enabled ?? Boolean(query.length >= 1),
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
