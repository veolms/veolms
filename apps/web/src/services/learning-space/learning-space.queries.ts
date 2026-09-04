import { useQuery } from "@tanstack/react-query";

import type { ApiError } from "../../lib/api-error";
import type { LearningSpaceSessionsResponse } from "@veolms/contracts";
import { learningSpaceKeys } from "./learning-space.keys";
import { learningSpaceService } from "./learning-space.service";

export function useLearningSpaceSessions(options?: {
  userId?: string | null;
  enabled?: boolean;
}) {
  const userId = options?.userId ?? null;
  return useQuery<LearningSpaceSessionsResponse, ApiError>({
    queryKey: learningSpaceKeys.sessions(userId),
    queryFn: learningSpaceService.list,
    enabled: Boolean(userId) && (options?.enabled ?? true),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
}
