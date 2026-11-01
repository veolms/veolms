import { useQuery, type QueryClient } from "@tanstack/react-query";
import type { DashboardRange } from "@veolms/contracts";
import { analyticsKeys } from "./analytics.keys";
import {
  analyticsService,
  type AnalyticsFilterParams,
  type AnalyticsScope,
} from "./analytics.service";

const TAB_STALE_MS = 30_000;

export function useAnalyticsOverview(
  scope: AnalyticsScope,
  params: AnalyticsFilterParams,
) {
  return useQuery({
    queryKey: analyticsKeys.tab("overview", scope, params),
    queryFn: () => analyticsService.getOverview(scope, params),
    staleTime: TAB_STALE_MS,
  });
}

export function useAnalyticsRevenue(
  scope: AnalyticsScope,
  params: AnalyticsFilterParams,
) {
  return useQuery({
    queryKey: analyticsKeys.tab("revenue", scope, params),
    queryFn: () => analyticsService.getRevenue(scope, params),
    staleTime: TAB_STALE_MS,
  });
}

export function useAnalyticsCourses(
  scope: AnalyticsScope,
  params: AnalyticsFilterParams,
) {
  return useQuery({
    queryKey: analyticsKeys.tab("courses", scope, params),
    queryFn: () => analyticsService.getCourses(scope, params),
    staleTime: TAB_STALE_MS,
  });
}

const dashboardQueryOptions = (range: DashboardRange) => ({
  queryKey: analyticsKeys.dashboard(range),
  queryFn: () => analyticsService.getDashboard(range),
  staleTime: 30_000,
});

export function useDashboard(
  range: DashboardRange = "30d",
  options?: { enabled?: boolean },
) {
  return useQuery({
    ...dashboardQueryOptions(range),
    enabled: options?.enabled ?? true,
  });
}

/**
 * Asks for the dashboard's numbers ahead of the dashboard itself, whose code
 * and permission check are still on their way, so that it opens with them
 * rather than with its own loading state.
 */
export function prefetchDashboard(
  queryClient: QueryClient,
  range: DashboardRange = "30d",
) {
  return queryClient.prefetchQuery(dashboardQueryOptions(range));
}
