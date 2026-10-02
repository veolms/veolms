import { z } from "zod";
import {
  enrollmentStatusSchema,
  enrollmentSourceSchema,
} from "../course/enrollment.ts";

export const enrolledCourseSchema = z.strictObject({
  enrollmentId: z.uuid(),
  courseId: z.uuid(),
  courseSlug: z.string(),
  courseTitle: z.string(),
  courseDescription: z.string().nullable().optional(),
  courseThumbnailUrl: z.string().nullable().optional(),
  courseThumbnailMediaId: z.uuid().nullable().optional(),
  totalSections: z.number().int().nonnegative(),
  totalLessons: z.number().int().nonnegative(),
  totalDurationSeconds: z.number().int().nonnegative(),
  enrolledAt: z.string().or(z.date()),
  status: enrollmentStatusSchema,
  source: enrollmentSourceSchema,
  progress: z.number().int().min(0).max(100).nullable(),
  lastAccessedAt: z.string().or(z.date()).nullable().optional(),
  accessExpiresAt: z.string().or(z.date()).nullable().optional(),
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
    id: z.uuid(),
    username: z.string(),
    displayName: z.string(),
    avatarUrl: z.string().nullable(),
  }),
  course: z.strictObject({
    id: z.uuid(),
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
