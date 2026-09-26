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

const dashboardLearningActivityMetricSchema = z.strictObject({
  value: z.number().nonnegative(),
});

const dashboardEnrollmentActivityBucketSchema = z.strictObject({
  start: z.iso.datetime(),
  end: z.iso.datetime(),
  value: z.number().int().nonnegative(),
});

export const dashboardLearningActivitySchema = z.strictObject({
  averageCourseProgress: dashboardLearningActivityMetricSchema,
  courseCompletionRate: dashboardLearningActivityMetricSchema,
  newEnrollments: dashboardLearningActivityMetricSchema,
  enrollmentActivity: z.strictObject({
    currentTotal: z.number().int().nonnegative(),
    previousTotal: z.number().int().nonnegative(),
    changePercent: z.number().nullable(),
    from: z.iso.datetime(),
    to: z.iso.datetime(),
    bucketHours: z.literal(8),
    timeZone: z.literal("UTC"),
    buckets: z.array(dashboardEnrollmentActivityBucketSchema).length(21),
  }),
});

export type DashboardLearningActivity = z.infer<
  typeof dashboardLearningActivitySchema
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
  learningActivity: dashboardLearningActivitySchema,
});

export type DashboardSummaryResponse = z.infer<
  typeof dashboardSummaryResponseSchema
>;
