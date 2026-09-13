import { useQuery } from "@tanstack/react-query";
import type { LearningProgressResponse } from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { learningProgressKeys } from "./learning-progress.keys";
import { learningProgressService } from "./learning-progress.service";

export function useLearningProgressSnapshot(
  courseKey: string,
  options?: { enabled?: boolean },
) {
  return useQuery<LearningProgressResponse, ApiError>({
    queryKey: learningProgressKeys.course(courseKey),
    queryFn: () => learningProgressService.get(courseKey),
    enabled: Boolean(courseKey && (options?.enabled ?? true)),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}
