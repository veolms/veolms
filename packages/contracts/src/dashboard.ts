import { z } from "zod";

export const dashboardRangeSchema = z.enum(["7d", "30d", "3m", "1y"]);
export type DashboardRange = z.infer<typeof dashboardRangeSchema>;

export const dashboardQuerySchema = z.object({
  range: dashboardRangeSchema.default("30d"),
});
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

export const dashboardKpiSchema = z.strictObject({
  value: z.number(),
  previousValue: z.number(),
  changePercent: z.number().nullable(),
});
export type DashboardKpi = z.infer<typeof dashboardKpiSchema>;

export const dashboardRevenueOverviewSchema = z.strictObject({
  range: dashboardRangeSchema,
  currency: z.string().length(3),
  trend: z.array(
    z.strictObject({
      date: z.string(),
      value: z.number(),
    }),
  ),
  grossSales: dashboardKpiSchema,
  netRevenue: dashboardKpiSchema,
  orders: dashboardKpiSchema,
  refunds: dashboardKpiSchema,
});
export type DashboardRevenueOverview = z.infer<
  typeof dashboardRevenueOverviewSchema
>;

export const dashboardSummaryResponseSchema = z.strictObject({
  revenue: z.strictObject({
    value: z.number(),
    previousValue: z.number(),
    changePercent: z.number().nullable(),
    currency: z.string().length(3),
  }),
  students: z.strictObject({
    total: z.number().int().nonnegative(),
    newThisMonth: z.number().int().nonnegative(),
  }),
  activeLearners: dashboardKpiSchema,
  watchHours: dashboardKpiSchema,
  revenueOverview: dashboardRevenueOverviewSchema,
});

export type DashboardSummaryResponse = z.infer<
  typeof dashboardSummaryResponseSchema
>;
