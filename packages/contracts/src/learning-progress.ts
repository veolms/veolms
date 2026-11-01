import { z } from "zod";

export const learningProgressCourseParamsSchema = z.strictObject({
  courseKey: z.string().trim().min(1).max(160),
});

export const learningProgressItemSchema = z.strictObject({
  lessonId: z.uuid(),
  progressPercent: z.number().int().min(0).max(100),
  /**
   * Where in the lesson's video the learner is now, in whole seconds. It is
   * the last point watched, not the furthest (which `progressPercent`
   * keeps), and saving it marks the lesson as the course's last played.
   */
  positionSeconds: z.number().int().min(0).max(86_400).optional(),
});

export const learningProgressBatchRequestSchema = z.strictObject({
  /** May be empty when the batch only reports watch time. */
  items: z.array(learningProgressItemSchema).max(100),
  /**
   * Seconds of video actually played since the page last reported, in media
   * time: a minute of video played at 2x is 60, and time skipped over with
   * the timeline is not counted at all. This is what the learner's daily
   * goal is credited from. A page that sends it (0 included) earns nothing
   * from progress alone; a page that omits it is an older one, still
   * credited the old way from how far its progress moved.
   */
  watchedSeconds: z.number().min(0).max(86_400).optional(),
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
  /** Where the learner last was in its video, when it is known. */
  positionSeconds: z.number().int().min(0).optional(),
  /** When that position was saved. */
  positionUpdatedAt: z.iso.datetime().optional(),
});

/** The lesson of the course the learner played last, and where. */
export const learningProgressLastPlayedSchema = z.strictObject({
  lessonId: z.uuid(),
  lessonNumber: z.number().int().positive(),
  positionSeconds: z.number().int().min(0),
  playedAt: z.iso.datetime(),
});

/**
 * Only lessons the learner has made progress on, or played, are listed.
 * `lastPlayed` is absent from an older API, and null when no position has
 * been saved for the course yet.
 */
export const learningProgressResponseSchema = z.strictObject({
  lessons: z.array(learningProgressLessonSchema),
  lastPlayed: learningProgressLastPlayedSchema.nullable().optional(),
});

export const learningProgressResumeLessonSchema = z.strictObject({
  lessonId: z.uuid(),
  lessonNumber: z.number().int().positive(),
  title: z.string().min(1),
  sectionTitle: z.string().min(1),
  progressPercent: z.number().int().min(0).max(100),
  /** Where the learner last was in its video, when it is known. */
  positionSeconds: z.number().int().min(0).optional(),
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
export type LearningProgressLastPlayed = z.infer<
  typeof learningProgressLastPlayedSchema
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
