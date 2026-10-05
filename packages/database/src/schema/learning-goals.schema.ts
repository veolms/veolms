import type { Generated } from "kysely";

/**
 * One row per user (carts pattern). `daily_goal_minutes` NULL means the
 * learner has not configured a goal yet — the UI shows an empty state and
 * no goal-dependent numbers. `time_zone` is an IANA id (validated at the
 * API layer) used to bucket learning_daily_activity into the learner's
 * local calendar days.
 */
export interface UserLearningSettingsTable {
  user_id: string;
  daily_goal_minutes: number | null;
  reminders_enabled: Generated<boolean>;
  reminder_days: Generated<string[]>;
  reminder_time: Generated<string>;
  time_zone: Generated<string>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/**
 * Per-user, per-local-day learning ledger. `seconds` are credited from
 * progress deltas x lesson duration on the existing heartbeat upsert;
 * `completions` counts lessons/quizzes that newly reached 100%. Streaks
 * and today's progress are derived from this table on read.
 */
export interface LearningDailyActivityTable {
  user_id: string;
  activity_date: Date;
  seconds: Generated<number>;
  completions: Generated<number>;
}
