import { z } from "zod";

export const accessGrantStatusSchema = z.enum([
  "active",
  "suspended",
  "revoked",
  "expired",
]);
export type AccessGrantStatus = z.infer<typeof accessGrantStatusSchema>;

export const accessGrantSourceSchema = z.enum([
  "purchase",
  "bundle_purchase",
  "free_grant",
  "admin_grant",
  "linked_course",
]);
export type AccessGrantSource = z.infer<typeof accessGrantSourceSchema>;

export const enrollmentStatusSchema = z.enum([
  "active",
  "suspended",
  "revoked",
  "expired",
]);
export type EnrollmentStatus = z.infer<typeof enrollmentStatusSchema>;

export const enrollmentSourceSchema = z.enum([
  "direct_purchase",
  "bundle_purchase",
  "free_grant",
  "admin_grant",
  "linked_course",
]);
export type EnrollmentSource = z.infer<typeof enrollmentSourceSchema>;

export const createManualAccessGrantRequestSchema = z.strictObject({
  userId: z.uuid(),
  courseId: z.uuid(),
  validUntil: z.string().or(z.date()).nullable().optional(),
});
export type CreateManualAccessGrantRequest = z.infer<
  typeof createManualAccessGrantRequestSchema
>;

export const accessGrantSchema = z.strictObject({
  id: z.uuid(),
  userId: z.uuid(),
  offeringId: z.uuid().optional(),
  courseId: z.uuid(),
  purchaseId: z.uuid().nullable().optional(),
  status: accessGrantStatusSchema,
  source: accessGrantSourceSchema,
  validFrom: z.string().or(z.date()),
  validUntil: z.string().or(z.date()).nullable().optional(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type AccessGrant = z.infer<typeof accessGrantSchema>;

/** One learner's access to one course, addressed without a grant id. */
export const courseAccessParamsSchema = z.object({
  userId: z.uuid(),
  courseId: z.uuid(),
});
export type CourseAccessParams = z.infer<typeof courseAccessParamsSchema>;

/** What a learner's access to a course is after staff revoked or restored it. */
export const courseAccessChangeResponseSchema = z.strictObject({
  userId: z.uuid(),
  courseId: z.uuid(),
  status: accessGrantStatusSchema,
});
export type CourseAccessChangeResponse = z.infer<
  typeof courseAccessChangeResponseSchema
>;

export const enrollmentSchema = z.strictObject({
  id: z.uuid(),
  userId: z.uuid(),
  courseId: z.uuid(),
  accessGrantId: z.uuid().nullable().optional(),
  orderId: z.uuid().nullable().optional(),
  status: enrollmentStatusSchema,
  source: enrollmentSourceSchema,
  accessStartsAt: z.string().or(z.date()),
  accessExpiresAt: z.string().or(z.date()).nullable().optional(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type Enrollment = z.infer<typeof enrollmentSchema>;

export const fulfillmentResultSchema = z.strictObject({
  orderId: z.uuid(),
  userId: z.uuid(),
  enrolledCourseIds: z.array(z.uuid()),
  skippedCourseIds: z.array(z.uuid()),
  fulfilledAt: z.string().or(z.date()),
});
export type FulfillmentResult = z.infer<typeof fulfillmentResultSchema>;
