import { z } from "zod";

export const enrolledCourseSchema = z.strictObject({
  courseId: z.uuid(),
  courseSlug: z.string(),
  courseTitle: z.string(),
  courseThumbnailUrl: z.string().nullable().optional(),
  courseThumbnailMediaId: z.uuid().nullable().optional(),
  totalSections: z.number().int().nonnegative(),
  totalLessons: z.number().int().nonnegative(),
  totalDurationSeconds: z.number().int().nonnegative(),
  enrolledAt: z.string().or(z.date()),
  /**
   * How much of the course has been watched, in percent with up to two
   * decimals (0.42): the average of its published lessons' watched shares.
   */
  progress: z.number().min(0).max(100).nullable(),
  /**
   * When the learner last watched any of it. Set from the first few seconds
   * watched, while `progress` may still round to 0.
   */
  lastAccessedAt: z.string().or(z.date()).nullable().optional(),
});
export type EnrolledCourse = z.infer<typeof enrolledCourseSchema>;

export const enrolledCoursesResponseSchema = z.strictObject({
  courses: z.array(enrolledCourseSchema),
});
export type EnrolledCoursesResponse = z.infer<
  typeof enrolledCoursesResponseSchema
>;

export const academyEnrollmentListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(10).default(10),
});
export type AcademyEnrollmentListQuery = z.infer<
  typeof academyEnrollmentListQuerySchema
>;

export const academyEnrollmentListItemSchema = z.strictObject({
  enrollmentId: z.uuid(),
  student: z.strictObject({
    username: z.string(),
    displayName: z.string(),
    avatarUrl: z.string().nullable(),
  }),
  course: z.strictObject({
    title: z.string(),
  }),
  averageProgressPercent: z.number().min(0).max(100).nullable(),
  enrolledAt: z.string().or(z.date()),
});
export type AcademyEnrollmentListItem = z.infer<
  typeof academyEnrollmentListItemSchema
>;

export const academyEnrollmentListResponseSchema = z.strictObject({
  items: z.array(academyEnrollmentListItemSchema),
});
export type AcademyEnrollmentListResponse = z.infer<
  typeof academyEnrollmentListResponseSchema
>;

export const unenrollCourseParamsSchema = z.strictObject({
  courseId: z.uuid(),
});
export type UnenrollCourseParams = z.infer<typeof unenrollCourseParamsSchema>;

export const unenrollCourseResponseSchema = z.strictObject({
  courseId: z.uuid(),
});
export type UnenrollCourseResponse = z.infer<
  typeof unenrollCourseResponseSchema
>;
