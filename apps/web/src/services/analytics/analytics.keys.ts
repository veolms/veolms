import type { DashboardRange } from "@veolms/contracts";

export const analyticsKeys = {
  all: ["analytics"] as const,
  tab: (
    tab: "overview" | "revenue" | "courses",
    scope: string,
    query: object,
  ) => [...analyticsKeys.all, tab, scope, query] as const,
  dashboard: (range: DashboardRange) =>
    [...analyticsKeys.all, "dashboard", range] as const,
};
