import type { Generated } from "kysely";

/**
 * One row per user (carts pattern). `daily_goal_minutes` NULL means the
 * learner has not chosen a goal of their own: the API then gives them the
 * default (`DEFAULT_DAILY_GOAL_MINUTES` in the contracts). `time_zone` is
 * an IANA id (validated at the API layer) used to bucket
 * learning_daily_activity into the learner's local calendar days.
 */
export interface UserLearningSettingsTable {
  user_id: string;
  daily_goal_minutes: number | null;
  reminders_enabled: Generated<boolean>;
  reminder_days: Generated<string[]>;
  reminder_time: Generated<string>;
  time_zone: Generated<string>;
  /**
   * Local date when the zone was last changed; activity is never credited
   * to an earlier day. Null until the first zone change.
   */
  accrual_floor_date: Date | null;
  /** Whether other members may see this learner's history. Off by default. */
  progress_shared: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/**
 * Per-user, per-local-day learning ledger. `seconds` are credited from
 * progress deltas x lesson duration on the existing heartbeat upsert;
 * `completions` counts lessons/quizzes that newly reached 100%. Streaks
 * and today's progress are derived from this table on read.
 *
 * `goal_minutes` is the learner's goal as it stood on that day (their own,
 * or the default), written with the day's activity. Null only on a row
 * written by a server that predates it.
 */
export interface LearningDailyActivityTable {
  user_id: string;
  activity_date: Date;
  seconds: Generated<number>;
  completions: Generated<number>;
  goal_minutes: number | null;
}

/**
 * The same ledger split by course: what a learner's day went to. Written
 * in the same statement as the day's total. Days before the table existed
 * have a total and no split.
 */
export interface LearningDailyCourseActivityTable {
  user_id: string;
  activity_date: Date;
  course_id: string;
  seconds: Generated<number>;
  completions: Generated<number>;
}
