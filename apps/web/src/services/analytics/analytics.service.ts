import { api } from "../../lib/api-client";
import {
  analyticsCoursesResponseSchema,
  analyticsOverviewResponseSchema,
  analyticsRevenueResponseSchema,
  dashboardSummaryResponseSchema,
} from "@veolms/contracts";
import type { DashboardRange } from "@veolms/contracts";

export interface AnalyticsFilterParams {
  from?: string;
  to?: string;
  courseId?: string;
}

/** Admins read the whole academy; everyone else their own courses. */
export type AnalyticsScope = "admin" | "instructor";

export const analyticsService = {
  getOverview: async (scope: AnalyticsScope, params: AnalyticsFilterParams) =>
    analyticsOverviewResponseSchema.parse(
      await api.get<unknown>(`/analytics/${scope}/overview`, { params }),
    ),
  getRevenue: async (scope: AnalyticsScope, params: AnalyticsFilterParams) =>
    analyticsRevenueResponseSchema.parse(
      await api.get<unknown>(`/analytics/${scope}/revenue`, { params }),
    ),
  getCourses: async (scope: AnalyticsScope, params: AnalyticsFilterParams) =>
    analyticsCoursesResponseSchema.parse(
      await api.get<unknown>(`/analytics/${scope}/courses`, { params }),
    ),
  getDashboard: async (range: DashboardRange = "30d") =>
    dashboardSummaryResponseSchema.parse(
      await api.get<unknown>("/analytics/dashboard", { params: { range } }),
    ),
};
