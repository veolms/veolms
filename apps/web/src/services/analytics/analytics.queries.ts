import { useQuery } from "@tanstack/react-query";
import { analyticsKeys } from "./analytics.keys";
import { analyticsService, type AnalyticsFilterParams } from "./analytics.service";

export function useAdminAnalyticsOverview(
  params: AnalyticsFilterParams = {},
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: analyticsKeys.adminOverview(params),
    queryFn: () => analyticsService.getAdminOverview(params),
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
  });
}

export function useInstructorAnalyticsOverview(
  params: AnalyticsFilterParams = {},
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: analyticsKeys.instructorOverview(params),
    queryFn: () => analyticsService.getInstructorOverview(params),
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
  });
}
