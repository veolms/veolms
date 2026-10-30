import { useQuery, type QueryClient } from "@tanstack/react-query";
import type {
  LearningProgressResponse,
  LearningProgressResumeContextResponse,
} from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { learningProgressKeys } from "./learning-progress.keys";
import { learningProgressService } from "./learning-progress.service";

const learningProgressSnapshotOptions = (courseKey: string) => ({
  queryKey: learningProgressKeys.course(courseKey),
  queryFn: () => learningProgressService.get(courseKey),
  staleTime: 5 * 60 * 1000,
  retry: false,
});

export function useLearningProgressSnapshot(
  courseKey: string,
  options?: { enabled?: boolean },
) {
  return useQuery<LearningProgressResponse, ApiError>({
    ...learningProgressSnapshotOptions(courseKey),
    enabled: Boolean(courseKey && (options?.enabled ?? true)),
  });
}

/**
 * Asks for the learner's progress in a course ahead of its lesson page,
 * which waits for it before it starts the video (where to start from).
 */
export function prefetchLearningProgressSnapshot(
  queryClient: QueryClient,
  courseKey: string,
) {
  return queryClient.prefetchQuery<LearningProgressResponse, ApiError>(
    learningProgressSnapshotOptions(courseKey),
  );
}

export function useLearningProgressResumeContext(
  courseKey: string | undefined,
  options?: { enabled?: boolean },
) {
  const enabled = Boolean(courseKey && (options?.enabled ?? true));

  return useQuery<LearningProgressResumeContextResponse, ApiError>({
    queryKey: learningProgressKeys.resumeContext(courseKey ?? ""),
    queryFn: () => learningProgressService.getResumeContext(courseKey!),
    enabled,
    staleTime: 60 * 1000,
    retry: false,
  });
}

/** `useLearningProgressResumeContext`'s answer, from the cache while fresh. */
export function fetchLearningProgressResumeContext(
  queryClient: QueryClient,
  courseKey: string,
): Promise<LearningProgressResumeContextResponse> {
  return queryClient.fetchQuery<
    LearningProgressResumeContextResponse,
    ApiError
  >({
    queryKey: learningProgressKeys.resumeContext(courseKey),
    queryFn: () => learningProgressService.getResumeContext(courseKey),
    staleTime: 60 * 1000,
    retry: false,
  });
}
