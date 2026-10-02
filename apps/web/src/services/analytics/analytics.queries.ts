import { useQuery } from "@tanstack/react-query";
import type { DashboardRange } from "@veolms/contracts";
import { analyticsKeys } from "./analytics.keys";
import {
  analyticsService,
  type AnalyticsFilterParams,
} from "./analytics.service";

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

export function useDashboard(
  range: DashboardRange = "30d",
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: analyticsKeys.dashboard(range),
    queryFn: () => analyticsService.getDashboard(range),
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
  });
}
