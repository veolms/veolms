import { z } from "zod";

/**
 * The analytics page's three core tabs: Overview, Revenue and Courses &
 * Content. Every money figure is in minor units (paise). Every tab answers
 * the same filter (a date range and an optional course), and every KPI
 * carries its change against the equal-length period just before the
 * range.
 *
 * The primitives at the top (`analyticsKpiSchema`, the trend point, the
 * filter) are shared with plugins that add further tabs.
 */

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

/** A KPI value and its change against the immediately-preceding equal-length
 * period, so the UI can show a "+12.4% vs last period" style trend badge. */
export const analyticsKpiSchema = z.strictObject({
  value: z.number(),
  changePercent: z.number().nullable(),
});
export type AnalyticsKpi = z.infer<typeof analyticsKpiSchema>;

/** No longer part of the overview response; kept for external importers. */
export const analyticsScopeSchema = z.strictObject({
  type: z.enum(["platform", "course"]),
  courseId: z.string().uuid().nullable(),
  courseIds: z.array(z.string().uuid()),
});

/**
 * One UTC day of order activity. Orders are counted on the day they were
 * created; a refund counts against its order's day, so a day's net is what
 * that day's orders are worth now.
 */
export const analyticsDailyOrdersPointSchema = z.strictObject({
  date: z.string(),
  grossSales: z.number().int(),
  netRevenue: z.number().int(),
  orders: z.number().int().nonnegative(),
  refundedAmount: z.number().int().nonnegative(),
  refunds: z.number().int().nonnegative(),
});
export type AnalyticsDailyOrdersPoint = z.infer<
  typeof analyticsDailyOrdersPointSchema
>;

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export const coursePerformanceRowSchema = z.strictObject({
  courseId: z.string().uuid(),
  title: z.string(),
  enrollments: z.number().int().nonnegative(),
  orders: z.number().int().nonnegative(),
  /** Minor units (paise). */
  netRevenue: z.number().int(),
  completionRate: z.number(),
  averageProgressPercent: z.number(),
});
export type CoursePerformanceRow = z.infer<typeof coursePerformanceRowSchema>;

/**
 * The commerce funnel as the ledger records it: orders created (checkout
 * started), orders paid, orders refunded. Each step counts events in the
 * range, not a cohort followed through. `inCarts` is beside the funnel,
 * not a step of it: a cart line is deleted when it is bought or removed,
 * so what is left are items added in the range and still waiting.
 */
export const commerceFunnelSchema = z.strictObject({
  inCarts: z.number().int().nonnegative(),
  checkoutStarted: z.number().int().nonnegative(),
  paid: z.number().int().nonnegative(),
  refunded: z.number().int().nonnegative(),
});
export type CommerceFunnel = z.infer<typeof commerceFunnelSchema>;

export const analyticsOverviewResponseSchema = z.strictObject({
  currency: z.string().length(3),
  /**
   * False when the caller may not see money: the revenue, orders and refund
   * figures are then zero and the daily orders empty. Missing means true.
   */
  includesRevenue: z.boolean().optional(),
  overview: z.strictObject({
    netRevenue: analyticsKpiSchema,
    orders: analyticsKpiSchema,
    newEnrollments: analyticsKpiSchema,
    /** Learners with at least one enrollment, as of the end of the range. */
    totalStudents: analyticsKpiSchema,
    /** Percent of successful orders with a processed refund. */
    refundRate: analyticsKpiSchema,
    completionRate: analyticsKpiSchema,
    dailyOrders: z.array(analyticsDailyOrdersPointSchema),
    /** For the enrollments tile's sparkline; the chart is on Courses. */
    dailyEnrollments: z.array(analyticsTrendPointSchema),
    coursePerformance: z.array(coursePerformanceRowSchema),
  }),
});
export type AnalyticsOverviewResponse = z.infer<
  typeof analyticsOverviewResponseSchema
>;

// ---------------------------------------------------------------------------
// Revenue
// ---------------------------------------------------------------------------

export const revenueProductTypeSchema = z.enum(["course", "bundle", "quiz"]);

export const revenueByProductRowSchema = z.strictObject({
  id: z.string(),
  type: revenueProductTypeSchema,
  title: z.string(),
  netRevenue: z.number().int(),
  orders: z.number().int().nonnegative(),
});
export type RevenueByProductRow = z.infer<typeof revenueByProductRowSchema>;

/** How an order was priced: at full price, with a coupon, or free. */
export const revenueSourceSchema = z.enum(["full_price", "coupon", "free"]);
export const revenueSourceRowSchema = z.strictObject({
  source: revenueSourceSchema,
  orders: z.number().int().nonnegative(),
  netRevenue: z.number().int(),
});
export type RevenueSourceRow = z.infer<typeof revenueSourceRowSchema>;

export const paymentMethodRowSchema = z.strictObject({
  /** The gateway's method name (upi, card, netbanking, wallet, …), "free",
   * or "unknown" where the payment record carries none. */
  method: z.string(),
  orders: z.number().int().nonnegative(),
  /** The orders' totals, minor units; agrees with gross sales. */
  amount: z.number().int().nonnegative(),
});
export type PaymentMethodRow = z.infer<typeof paymentMethodRowSchema>;

export const couponPerformanceRowSchema = z.strictObject({
  couponId: z.string().uuid(),
  code: z.string(),
  orders: z.number().int().nonnegative(),
  grossSales: z.number().int(),
  discountGiven: z.number().int(),
  netRevenue: z.number().int(),
});
export type CouponPerformanceRow = z.infer<typeof couponPerformanceRowSchema>;

export const topRevenueCourseRowSchema = z.strictObject({
  courseId: z.string().uuid(),
  title: z.string(),
  grossSales: z.number().int(),
  netRevenue: z.number().int(),
  orders: z.number().int().nonnegative(),
  buyers: z.number().int().nonnegative(),
  refundedAmount: z.number().int().nonnegative(),
  averageOrderValue: z.number().int(),
});
export type TopRevenueCourseRow = z.infer<typeof topRevenueCourseRowSchema>;

export const analyticsRevenueResponseSchema = z.strictObject({
  currency: z.string().length(3),
  revenue: z.strictObject({
    grossSales: analyticsKpiSchema,
    netRevenue: analyticsKpiSchema,
    orders: analyticsKpiSchema,
    uniqueBuyers: analyticsKpiSchema,
    averageOrderValue: analyticsKpiSchema,
    /** Percent of successful orders with a processed refund. */
    refundRate: analyticsKpiSchema,
    refundedAmount: analyticsKpiSchema,
    refundCount: analyticsKpiSchema,
    funnel: commerceFunnelSchema,
    daily: z.array(analyticsDailyOrdersPointSchema),
    byProduct: z.array(revenueByProductRowSchema),
    sources: z.array(revenueSourceRowSchema),
    paymentMethods: z.array(paymentMethodRowSchema),
    coupons: z.array(couponPerformanceRowSchema),
    topCourses: z.array(topRevenueCourseRowSchema),
  }),
});
export type AnalyticsRevenueResponse = z.infer<
  typeof analyticsRevenueResponseSchema
>;

// ---------------------------------------------------------------------------
// Courses & Content
// ---------------------------------------------------------------------------

export const topCourseRowSchema = z.strictObject({
  courseId: z.string().uuid(),
  title: z.string(),
  /** Enrollments created in the range. */
  enrollments: z.number().int().nonnegative(),
  /** Everyone enrolled, whenever they joined. */
  learners: z.number().int().nonnegative(),
  completionRate: z.number(),
  averageProgressPercent: z.number(),
  lessons: z.number().int().nonnegative(),
  durationHours: z.number().nonnegative(),
});
export type TopCourseRow = z.infer<typeof topCourseRowSchema>;

export const contentInsightsSchema = z.strictObject({
  courses: z.number().int().nonnegative(),
  publishedCourses: z.number().int().nonnegative(),
  sections: z.number().int().nonnegative(),
  lessons: z.number().int().nonnegative(),
  videoLessons: z.number().int().nonnegative(),
  documentLessons: z.number().int().nonnegative(),
  quizLessons: z.number().int().nonnegative(),
  resources: z.number().int().nonnegative(),
  durationHours: z.number().nonnegative(),
});
export type ContentInsights = z.infer<typeof contentInsightsSchema>;

export const analyticsQuizSummarySchema = z.strictObject({
  attempts: z.number().int().nonnegative(),
  submitted: z.number().int().nonnegative(),
  /** Percent of submitted attempts that passed. */
  passRate: z.number(),
  /** Mean score percentage of submitted attempts. */
  averageScore: z.number(),
});
export type AnalyticsQuizSummary = z.infer<typeof analyticsQuizSummarySchema>;

export const analyticsCoursesResponseSchema = z.strictObject({
  courses: z.strictObject({
    /** Published courses as of the end of the range. */
    activeCourses: analyticsKpiSchema,
    enrollments: analyticsKpiSchema,
    averageCompletion: analyticsKpiSchema,
    /** Published lessons as of the end of the range. */
    lessonsPublished: analyticsKpiSchema,
    /** Hours of published video as of the end of the range. */
    totalDurationHours: analyticsKpiSchema,
    quizAttempts: analyticsKpiSchema,
    dailyEnrollments: z.array(analyticsTrendPointSchema),
    topCourses: z.array(topCourseRowSchema),
    content: contentInsightsSchema,
    quizzes: analyticsQuizSummarySchema,
  }),
});
export type AnalyticsCoursesResponse = z.infer<
  typeof analyticsCoursesResponseSchema
>;
