import { z } from "zod";

/** One point in a day-bucketed trend line ("YYYY-MM-DD" UTC calendar day). */
export const analyticsTrendPointSchema = z.strictObject({
  date: z.string(),
  value: z.number(),
});
export type AnalyticsTrendPoint = z.infer<typeof analyticsTrendPointSchema>;

export const analyticsFilterQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  courseId: z.string().uuid().optional(),
});
export type AnalyticsFilterQuery = z.infer<typeof analyticsFilterQuerySchema>;

/** A KPI value alongside the immediately-preceding equal-length period, so
 * the UI can show a "+12.4% vs last period" style trend badge. */
export const analyticsKpiSchema = z.strictObject({
  value: z.number(),
  previousValue: z.number(),
  changePercent: z.number().nullable(),
});
export type AnalyticsKpi = z.infer<typeof analyticsKpiSchema>;

export const coursePerformanceRowSchema = z.strictObject({
  courseId: z.string().uuid(),
  title: z.string(),
  enrollments: z.number().int().nonnegative(),
  netRevenue: z.number().int(),
  completionRate: z.number(),
  averageProgressPercent: z.number(),
});
export type CoursePerformanceRow = z.infer<typeof coursePerformanceRowSchema>;

export const analyticsScopeSchema = z.strictObject({
  type: z.enum(["platform", "course"]),
  courseId: z.string().uuid().nullable(),
  courseIds: z.array(z.string().uuid()),
});

const orderFunnelSchema = z.strictObject({
  created: z.number().int().nonnegative(),
  paid: z.number().int().nonnegative(),
  refunded: z.number().int().nonnegative(),
});

const learningFunnelSchema = z.strictObject({
  enrolled: z.number().int().nonnegative(),
  started: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
});

export const analyticsOverviewResponseSchema = z.strictObject({
  scope: analyticsScopeSchema,
  currency: z.string().length(3),

  overview: z.strictObject({
    netRevenue: analyticsKpiSchema,
    orders: analyticsKpiSchema,
    newEnrollments: analyticsKpiSchema,
    activeLearners: analyticsKpiSchema,
    estimatedWatchHours: analyticsKpiSchema,
    completionRate: analyticsKpiSchema,
    revenueTrend: z.array(analyticsTrendPointSchema),
    orderFunnel: orderFunnelSchema,
    learningFunnel: learningFunnelSchema,
    coursePerformance: z.array(coursePerformanceRowSchema),
  }),
});
export type AnalyticsOverviewResponse = z.infer<
  typeof analyticsOverviewResponseSchema
>;
