import { z } from "zod";

export const learningProgressCourseParamsSchema = z.strictObject({
  courseKey: z.string().trim().min(1).max(160),
});

export const learningProgressItemSchema = z.strictObject({
  lessonId: z.uuid(),
  progressPercent: z.number().int().min(0).max(100),
});

export const learningProgressBatchRequestSchema = z.strictObject({
  items: z.array(learningProgressItemSchema).min(1).max(100),
});

export const learningProgressLessonSchema = z.strictObject({
  lessonId: z.uuid(),
  lessonNumber: z.number().int().positive(),
  progressPercent: z.number().int().min(0).max(100),
});

export const learningProgressResponseSchema = z.strictObject({
  courseId: z.uuid(),
  courseSlug: z.string().min(1).max(160),
  totalLessons: z.number().int().nonnegative(),
  completedLessons: z.number().int().nonnegative(),
  progressPercent: z.number().int().min(0).max(100),
  lessons: z.array(learningProgressLessonSchema),
});

export const learningProgressSyncResponseSchema = z.strictObject({
  synced: z.literal(true),
});

export type LearningProgressCourseParams = z.infer<
  typeof learningProgressCourseParamsSchema
>;
export type LearningProgressItem = z.infer<typeof learningProgressItemSchema>;
export type LearningProgressBatchRequest = z.infer<
  typeof learningProgressBatchRequestSchema
>;
export type LearningProgressLesson = z.infer<
  typeof learningProgressLessonSchema
>;
export type LearningProgressResponse = z.infer<
  typeof learningProgressResponseSchema
>;
export type LearningProgressSyncResponse = z.infer<
  typeof learningProgressSyncResponseSchema
>;

z.globalRegistry.add(learningProgressBatchRequestSchema, {
  id: "LearningProgressBatchRequest",
});
z.globalRegistry.add(learningProgressResponseSchema, {
  id: "LearningProgressResponse",
  description: "The authenticated learner's progress for one course.",
});
z.globalRegistry.add(learningProgressSyncResponseSchema, {
  id: "LearningProgressSyncResponse",
});
