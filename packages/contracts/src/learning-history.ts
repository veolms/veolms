import { z } from "zod";
import { publicProfileUsernameParamsSchema } from "./auth/user.ts";

/**
 * A learner's history, day by day: the time they learned, the goal they had
 * that day, and the courses the time went to.
 *
 * It is the learner's own. An admin can read anyone's. Other members can
 * read it only when the learner has turned sharing on (`shared`), and the
 * list of members who have is what the Progress page shows beside one's own.
 *
 * Days are the learner's local calendar days (their stored time zone), as
 * `YYYY-MM-DD`. Only days with something recorded are listed: a day that is
 * not there is a day without learning.
 */

const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Dates are written YYYY-MM-DD");

/** The longest span one request may ask for, in days. */
export const LEARNING_HISTORY_MAX_DAYS = 400;

export const learningHistoryQuerySchema = z.object({
  /** First and last day wanted, both included. */
  from: localDateSchema,
  to: localDateSchema,
  /** Whose history, by username. The viewer's own when left out. */
  username: publicProfileUsernameParamsSchema.shape.username.optional(),
});
export type LearningHistoryQuery = z.infer<typeof learningHistoryQuerySchema>;

/** Who a history belongs to, as shown at its head and in the list. */
export const learningHistoryLearnerSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  /** Their public profile is at `/<username>`. */
  username: z.string(),
  avatarUrl: z.string().nullable(),
});
export type LearningHistoryLearner = z.infer<
  typeof learningHistoryLearnerSchema
>;

export const learningHistoryCourseShareSchema = z.strictObject({
  /** A course in the answer's `courses`. */
  courseId: z.uuid(),
  seconds: z.number().int().nonnegative(),
  /** Lessons and quizzes finished in this course that day. */
  completions: z.number().int().nonnegative(),
});

export const learningHistoryDaySchema = z.strictObject({
  date: localDateSchema,
  seconds: z.number().int().nonnegative(),
  /** Lessons and quizzes finished that day. */
  completions: z.number().int().nonnegative(),
  /** The learner's goal as it stood that day, in minutes. */
  goalMinutes: z.number().int().positive(),
  /**
   * What the day went to, longest first. Empty for a day recorded before
   * courses were kept (only its total is known).
   */
  courses: z.array(learningHistoryCourseShareSchema),
});
export type LearningHistoryDay = z.infer<typeof learningHistoryDaySchema>;

export const learningHistoryCourseSchema = z.strictObject({
  id: z.uuid(),
  title: z.string(),
  slug: z.string(),
  thumbnailUrl: z.string().nullable(),
});
export type LearningHistoryCourse = z.infer<typeof learningHistoryCourseSchema>;

export const learningHistoryResponseSchema = z.strictObject({
  learner: learningHistoryLearnerSchema,
  /** Whether the history is the viewer's own. */
  isOwn: z.boolean(),
  /** Whether the learner lets other members see it. */
  shared: z.boolean(),
  /** Today in the learner's calendar; no day after it can have a record. */
  today: localDateSchema,
  /** The learner's goal now, in minutes: what a day without a record had. */
  goalMinutes: z.number().int().positive(),
  days: z.array(learningHistoryDaySchema),
  /** Every course named in `days`. */
  courses: z.array(learningHistoryCourseSchema),
});
export type LearningHistoryResponse = z.infer<
  typeof learningHistoryResponseSchema
>;

/** One member who shares their progress, with their last seven days. */
export const learningCommunityLearnerSchema = z.strictObject({
  learner: learningHistoryLearnerSchema,
  /** The viewer themself: they are listed with the others when they share. */
  isYou: z.boolean(),
  goalMinutes: z.number().int().positive(),
  todaySeconds: z.number().int().nonnegative(),
  /** The last seven days, today included. */
  weekSeconds: z.number().int().nonnegative(),
  /** How many of those seven days met the goal of the day. */
  weekGoalsMet: z.number().int().min(0).max(7),
});
export type LearningCommunityLearner = z.infer<
  typeof learningCommunityLearnerSchema
>;

export const learningCommunityResponseSchema = z.strictObject({
  /** Most time in the last seven days first. */
  learners: z.array(learningCommunityLearnerSchema),
});
export type LearningCommunityResponse = z.infer<
  typeof learningCommunityResponseSchema
>;

export const updateProgressSharingRequestSchema = z.strictObject({
  shared: z.boolean(),
  /**
   * The device's IANA time zone. Used only when nothing is stored for the
   * learner yet, so that turning sharing on does not fix their days to UTC.
   */
  timeZone: z.string().min(1).max(64).optional(),
});
export type UpdateProgressSharingRequest = z.infer<
  typeof updateProgressSharingRequestSchema
>;

export const progressSharingResponseSchema = z.strictObject({
  shared: z.boolean(),
});
export type ProgressSharingResponse = z.infer<
  typeof progressSharingResponseSchema
>;

z.globalRegistry.add(learningHistoryResponseSchema, {
  id: "LearningHistoryResponse",
  description:
    "A learner's days of learning in a range, with the goal of each day and its courses.",
});
z.globalRegistry.add(learningCommunityResponseSchema, {
  id: "LearningCommunityResponse",
  description: "Members who share their progress, with their last seven days.",
});
z.globalRegistry.add(progressSharingResponseSchema, {
  id: "ProgressSharingResponse",
  description: "Whether the learner shares their progress with other members.",
});
