import type { DashboardRange } from "@veolms/contracts";

export const analyticsKeys = {
  all: ["analytics"] as const,
  adminOverview: (query: object) => [...analyticsKeys.all, "admin-overview", query] as const,
  instructorOverview: (query: object) =>
    [...analyticsKeys.all, "instructor-overview", query] as const,
  dashboard: (range: DashboardRange) => [...analyticsKeys.all, "dashboard", range] as const,
};
