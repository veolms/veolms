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
  /**
   * The device's IANA time zone. Used only to set the learner's zone when
   * they have never saved one, so their learning days follow their own
   * calendar instead of UTC. Ignored once a zone is saved, or if unknown.
   */
  timeZone: z.string().min(1).max(64).optional(),
});

export const learningProgressLessonSchema = z.strictObject({
  lessonId: z.uuid(),
  lessonNumber: z.number().int().positive(),
  progressPercent: z.number().int().min(0).max(100),
});

/** Only lessons the learner has made progress on are listed. */
export const learningProgressResponseSchema = z.strictObject({
  lessons: z.array(learningProgressLessonSchema),
});

export const learningProgressResumeLessonSchema = z.strictObject({
  lessonId: z.uuid(),
  lessonNumber: z.number().int().positive(),
  title: z.string().min(1),
  sectionTitle: z.string().min(1),
  progressPercent: z.number().int().min(0).max(100),
});

export const learningProgressResumeContextResponseSchema = z.strictObject({
  courseId: z.uuid(),
  courseSlug: z.string().min(1).max(160),
  totalLessons: z.number().int().nonnegative(),
  completedLessons: z.number().int().nonnegative(),
  resumeLesson: learningProgressResumeLessonSchema.nullable(),
  upcomingLessons: z.array(learningProgressResumeLessonSchema).max(3),
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
export type LearningProgressResumeLesson = z.infer<
  typeof learningProgressResumeLessonSchema
>;
export type LearningProgressResumeContextResponse = z.infer<
  typeof learningProgressResumeContextResponseSchema
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
z.globalRegistry.add(learningProgressResumeContextResponseSchema, {
  id: "LearningProgressResumeContextResponse",
  description:
    "The best persisted-progress-based lesson resume context for one accessible course.",
});
z.globalRegistry.add(learningProgressSyncResponseSchema, {
  id: "LearningProgressSyncResponse",
});
