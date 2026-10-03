import { useQuery } from "@tanstack/react-query";
import type { RecentUpdatesResponse } from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { recentUpdatesKeys } from "./recent-updates.keys";
import { recentUpdatesService, type RecentUpdatesRequest } from "./recent-updates.service";

export const recentUpdatesHomeParams: RecentUpdatesRequest = {
  days: 14,
  limit: 2,
  lessonsPerCourse: 2,
};

export function useRecentLearningUpdates(
  params: RecentUpdatesRequest = recentUpdatesHomeParams,
  options?: { enabled?: boolean },
) {
  return useQuery<RecentUpdatesResponse, ApiError>({
    queryKey: recentUpdatesKeys.list(params),
    queryFn: () => recentUpdatesService.list(params),
    enabled: options?.enabled ?? true,
    staleTime: 60 * 1000,
  });
}
