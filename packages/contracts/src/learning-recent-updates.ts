import { z } from "zod";

export const recentUpdatesQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(14),
  limit: z.coerce.number().int().min(1).max(10).default(5),
  lessonsPerCourse: z.coerce.number().int().min(1).max(5).default(3),
});
export type RecentUpdatesQuery = z.infer<typeof recentUpdatesQuerySchema>;

export const recentUpdateLessonSchema = z.strictObject({
  lessonId: z.uuid(),
  lessonTitle: z.string().min(1),
  lessonNumber: z.number().int().positive(),
  updatedAt: z.iso.datetime(),
});
export type RecentUpdateLesson = z.infer<typeof recentUpdateLessonSchema>;

export const recentUpdateCourseSchema = z.strictObject({
  courseId: z.uuid(),
  courseSlug: z.string().min(1).max(160),
  courseTitle: z.string().min(1),
  courseThumbnailUrl: z.string().nullable(),
  courseThumbnailMediaId: z.uuid().nullable(),
  recentLessonCount: z.number().int().nonnegative(),
  latestUpdatedAt: z.iso.datetime(),
  lessons: z.array(recentUpdateLessonSchema),
});
export type RecentUpdateCourse = z.infer<typeof recentUpdateCourseSchema>;

export const recentUpdatesResponseSchema = z.strictObject({
  courses: z.array(recentUpdateCourseSchema),
});
export type RecentUpdatesResponse = z.infer<typeof recentUpdatesResponseSchema>;

z.globalRegistry.add(recentUpdatesResponseSchema, {
  id: "RecentUpdatesResponse",
  description:
    "Recently updated published lessons from the authenticated learner's active enrolled courses.",
});
