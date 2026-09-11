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
export type EnrolledCoursesResponse = z.infer<typeof enrolledCoursesResponseSchema>;
