import { z } from "zod";
import { courseSchema } from "./course/course.ts";

export const dashboardRangeSchema = z.enum(["7d", "30d", "3m", "1y"]);
export type DashboardRange = z.infer<typeof dashboardRangeSchema>;

export const dashboardQuerySchema = z.object({
  range: dashboardRangeSchema.default("30d"),
});
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

export const dashboardKpiSchema = z.strictObject({
  value: z.number(),
  changePercent: z.number().nullable(),
});
export type DashboardKpi = z.infer<typeof dashboardKpiSchema>;

export const dashboardRevenueOverviewSchema = z.strictObject({
  currency: z.string().length(3),
  trend: z.array(
    z.strictObject({
      date: z.string(),
      value: z.number(),
    }),
  ),
  /** grossSales, netRevenue and the trend values are in minor units (paise). */
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

/** One UTC 8-hour window; `start` is its inclusive lower bound. */
const dashboardEnrollmentActivityBucketSchema = z.strictObject({
  start: z.iso.datetime(),
  value: z.number().int().nonnegative(),
});

export const dashboardLearningActivitySchema = z.strictObject({
  averageCourseProgress: dashboardLearningActivityMetricSchema,
  courseCompletionRate: dashboardLearningActivityMetricSchema,
  newEnrollments: dashboardLearningActivityMetricSchema,
  enrollmentActivity: z.strictObject({
    /** Last seven days against the seven before them. */
    changePercent: z.number().nullable(),
    buckets: z.array(dashboardEnrollmentActivityBucketSchema).length(21),
  }),
});

export type DashboardLearningActivity = z.infer<
  typeof dashboardLearningActivitySchema
>;

export const dashboardYourCourseSchema = z.strictObject({
  id: z.uuid(),
  title: z.string(),
  thumbnailUrl: courseSchema.shape.thumbnailUrl,
  thumbnailSrcSet: courseSchema.shape.thumbnailSrcSet,
  status: courseSchema.shape.status,
  students: z.number().int().nonnegative(),
  averageProgressPercent: z.number().nonnegative().nullable(),
});
export type DashboardYourCourse = z.infer<typeof dashboardYourCourseSchema>;

export const dashboardSummaryResponseSchema = z.strictObject({
  /** value is in minor units (paise). */
  revenue: z.strictObject({
    value: z.number(),
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
  yourCourses: z.array(dashboardYourCourseSchema),
});

export type DashboardSummaryResponse = z.infer<
  typeof dashboardSummaryResponseSchema
>;
