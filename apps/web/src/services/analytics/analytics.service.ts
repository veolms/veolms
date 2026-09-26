import { api } from "../../lib/api-client";
import {
  analyticsOverviewResponseSchema,
  dashboardSummaryResponseSchema,
} from "@veolms/contracts";

export interface AnalyticsFilterParams {
  from?: string;
  to?: string;
  courseId?: string;
}

export const analyticsService = {
  getAdminOverview: async (params: AnalyticsFilterParams = {}) =>
    analyticsOverviewResponseSchema.parse(
      await api.get<unknown>("/analytics/admin/overview", { params }),
    ),
  getInstructorOverview: async (params: AnalyticsFilterParams = {}) =>
    analyticsOverviewResponseSchema.parse(
      await api.get<unknown>("/analytics/instructor/overview", { params }),
    ),
  getDashboard: async () =>
    dashboardSummaryResponseSchema.parse(
      await api.get<unknown>("/analytics/dashboard"),
    ),
};
