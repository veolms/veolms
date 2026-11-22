import { z } from "zod";

/**
 * The filters the academy's Orders screen combines: several courses, coupons
 * or statuses at once, each either kept (include) or left out (exclude).
 * Shared by the orders list, its statistics and its CSV export, so the three
 * always describe the same orders.
 */

/** Most ids one filter may name; more is refused rather than truncated. */
export const ORDER_FILTER_MAX_IDS = 200;

/** `include` keeps orders with any named value; `exclude` keeps every other. */
export const orderFilterModeSchema = z.enum(["include", "exclude"]);
export type OrderFilterMode = z.infer<typeof orderFilterModeSchema>;

/**
 * What was sold: `paid` is an order with a price before discounts (a coupon
 * taking all of it off still makes a paid order), `free` a free enrollment.
 */
export const orderKindSchema = z.enum(["paid", "free"]);
export type OrderKind = z.infer<typeof orderKindSchema>;

/** Ids separated by commas, as a query string carries a list. */
export const uuidListSchema = z
  .string()
  .max(ORDER_FILTER_MAX_IDS * 37)
  .transform((value) =>
    value
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.uuid()).min(1).max(ORDER_FILTER_MAX_IDS));

/** The fields of the shared filter that are not statuses. */
export const orderFilterFieldsShape = {
  courseIds: uuidListSchema.optional(),
  courseMode: orderFilterModeSchema.default("include"),
  couponIds: uuidListSchema.optional(),
  couponMode: orderFilterModeSchema.default("include"),
  statusMode: orderFilterModeSchema.default("include"),
  kind: orderKindSchema.optional(),
};

/**
 * A course the Orders screen can filter by: the published ones and any other
 * that has orders (an archived course still has its sales).
 */
export const orderCourseOptionSchema = z.strictObject({
  id: z.uuid(),
  title: z.string(),
  isFree: z.boolean(),
  /** What a learner pays, minor units; 0 for a free course. */
  price: z.number().int().nonnegative(),
  currency: z.string().length(3),
  thumbnailUrl: z.string().nullable(),
});
export type OrderCourseOption = z.infer<typeof orderCourseOptionSchema>;

export const orderCourseOptionsResponseSchema = z.strictObject({
  courses: z.array(orderCourseOptionSchema),
});
export type OrderCourseOptionsResponse = z.infer<
  typeof orderCourseOptionsResponseSchema
>;

/** Figures only a view of free enrollments shows. */
export const freeOrderStatsSchema = z.strictObject({
  enrollments: z.number().int().nonnegative(),
  uniqueLearners: z.number().int().nonnegative(),
  mostEnrolled: z
    .strictObject({
      courseId: z.uuid(),
      title: z.string(),
      enrollments: z.number().int().nonnegative(),
    })
    .nullable(),
  /** Learners among them who have also bought a paid course, at any time. */
  alsoBoughtPaid: z.number().int().nonnegative(),
});
export type FreeOrderStats = z.infer<typeof freeOrderStatsSchema>;
