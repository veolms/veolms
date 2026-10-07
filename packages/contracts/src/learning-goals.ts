import { z } from "zod";

/**
 * Dynamic learning goals & streaks (approved PRD, 2026-10).
 *
 * Settings: one record per user. `dailyGoalMinutes` null = not configured
 * (the home widget shows an empty state). `timeZone` is an IANA id — it
 * buckets activity into the learner's local calendar days; the API
 * validates it against Intl.
 */

export const LEARNING_REMINDER_DAY_IDS = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;

export const learningReminderDaySchema = z.enum(LEARNING_REMINDER_DAY_IDS);
export type LearningReminderDay = z.infer<typeof learningReminderDaySchema>;

const reminderTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Reminder time must be HH:MM (24h)");

const timeZoneSchema = z
  .string()
  .min(1)
  .max(64)
  .refine(
    (zone) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: zone });
        return true;
      } catch {
        return false;
      }
    },
    { message: "timeZone must be a valid IANA time zone identifier" },
  );

export const learningGoalSettingsSchema = z.strictObject({
  /** Null = the learner has not configured a goal. */
  dailyGoalMinutes: z.number().int().min(15).max(720).nullable(),
  remindersEnabled: z.boolean(),
  reminderDays: z.array(learningReminderDaySchema).max(7),
  /** 24h local wall-clock time, e.g. "19:00". */
  reminderTime: reminderTimeSchema,
  /** IANA id, e.g. "Asia/Kolkata". */
  timeZone: timeZoneSchema,
});
export type LearningGoalSettings = z.infer<typeof learningGoalSettingsSchema>;

export const updateLearningGoalSettingsRequestSchema =
  learningGoalSettingsSchema;
export type UpdateLearningGoalSettingsRequest = z.infer<
  typeof updateLearningGoalSettingsRequestSchema
>;

export const learningGoalSettingsResponseSchema = z.strictObject({
  /** False until the learner saves a goal for the first time. */
  configured: z.boolean(),
  /**
   * False when nothing is stored for the learner yet and `settings` are
   * defaults — the time zone in particular is then a placeholder, not a
   * choice, and the client should offer the device zone instead.
   */
  hasSavedSettings: z.boolean(),
  settings: learningGoalSettingsSchema,
});
export type LearningGoalSettingsResponse = z.infer<
  typeof learningGoalSettingsResponseSchema
>;

/**
 * Everything the home goal/streak widget needs in one call.
 * Streak rule (PRD §9): a learning day is a local-timezone calendar day
 * with >= 60 credited seconds OR >= 1 lesson/quiz completion. The streak
 * is independent of the goal, so goal changes never rewrite history.
 */
export const learningSummaryResponseSchema = z.strictObject({
  configured: z.boolean(),
  dailyGoalMinutes: z.number().int().nullable(),
  todaySeconds: z.number().int().nonnegative(),
  /** 0-100, capped; 0 when no goal is configured. */
  todayPct: z.number().int().min(0).max(100),
  /** Seconds still needed to hit today's goal; 0 when done or no goal. */
  remainingSeconds: z.number().int().nonnegative(),
  goalCompletedToday: z.boolean(),
  weekSeconds: z.number().int().nonnegative(),
  /** dailyGoal x 7, in seconds; 0 when no goal is configured. */
  weekTargetSeconds: z.number().int().nonnegative(),
  currentStreakDays: z.number().int().nonnegative(),
  bestStreakDays: z.number().int().nonnegative(),
  /** Local calendar date (YYYY-MM-DD) of the latest learning day, if any. */
  lastActivityDate: z.string().nullable(),
});
export type LearningSummaryResponse = z.infer<
  typeof learningSummaryResponseSchema
>;

z.globalRegistry.add(learningGoalSettingsSchema, {
  id: "LearningGoalSettings",
  description: "A learner's daily goal and reminder configuration.",
});
z.globalRegistry.add(learningGoalSettingsResponseSchema, {
  id: "LearningGoalSettingsResponse",
  description: "Learning goal settings with a configured flag.",
});
z.globalRegistry.add(learningSummaryResponseSchema, {
  id: "LearningSummaryResponse",
  description:
    "Today's learning progress against the goal, weekly totals, and streaks.",
});
