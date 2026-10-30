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

/**
 * What the learner is playing when the batch is sent. Absent when nothing
 * is playing on this device, which releases this device's playback claim.
 */
export const learningProgressPlayingSchema = z.strictObject({
  lessonId: z.uuid(),
  /**
   * "play": the viewer just pressed play on this device (a new claim,
   *   always wins against an existing heartbeat on another device).
   * "heartbeat": still playing since the last report.
   */
  event: z.enum(["play", "heartbeat"]),
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
  /** The lesson playing on this device when the report was sent. Absent when
   *  nothing is playing here, which releases this device's claim. */
  playing: learningProgressPlayingSchema.optional(),
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

/**
 * The server's answer about whether this device may play. Absent when the
 * stream limit is off, the user is staff, or the client did not send
 * `playing` (older client). Absent always means "allowed".
 */
export const learningProgressPlaybackSchema = z.discriminatedUnion("allowed", [
  z.strictObject({ allowed: z.literal(true) }),
  z.strictObject({
    allowed: z.literal(false),
    /** The device whose play is newer than this one's. */
    playingOn: z.strictObject({
      userAgent: z.string().nullable(),
      location: z.string().nullable(),
      lessonTitle: z.string().nullable(),
      since: z.iso.datetime(),
    }),
  }),
]);

export const learningProgressSyncResponseSchema = z.strictObject({
  synced: z.literal(true),
  playback: learningProgressPlaybackSchema.optional(),
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
export type LearningProgressPlaying = z.infer<
  typeof learningProgressPlayingSchema
>;
export type LearningProgressPlayback = z.infer<
  typeof learningProgressPlaybackSchema
>;

z.globalRegistry.add(learningProgressBatchRequestSchema, {
  id: "LearningProgressBatchRequest",
});
z.globalRegistry.add(learningProgressPlayingSchema, {
  id: "LearningProgressPlaying",
});
z.globalRegistry.add(learningProgressPlaybackSchema, {
  id: "LearningProgressPlayback",
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
