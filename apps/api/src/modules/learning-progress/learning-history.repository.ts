import { sql } from "kysely";
import type { DatabaseExecutor } from "@veolms/database";

/**
 * Reads of a learner's history, and their choice to share it. The tables
 * are the ones the heartbeat writes (see `upsertProgressAndAccrueActivity`
 * in learning-progress.repository.ts): the day's total, and its split by
 * course.
 */

export interface LearnerCalendar {
  /** Today in the learner's zone, `YYYY-MM-DD`. */
  today: string;
  /** Their own goal, or null when they have chosen none. */
  dailyGoalMinutes: number | null;
  shared: boolean;
}

/**
 * What a history is read against: the learner's today, their goal and
 * whether they share. A learner with nothing stored is on UTC days, has no
 * goal of their own and shares nothing.
 */
export async function findLearnerCalendar(
  database: DatabaseExecutor,
  userId: string,
): Promise<LearnerCalendar> {
  const result = await sql<{
    today: string;
    daily_goal_minutes: number | null;
    progress_shared: boolean;
  }>`
    select
      to_char(
        greatest(
          (now() at time zone s.time_zone)::date,
          coalesce(s.accrual_floor_date, '-infinity'::date)
        ),
        'YYYY-MM-DD'
      ) as today,
      s.daily_goal_minutes,
      s.progress_shared
    from user_learning_settings s
    where s.user_id = ${userId}::uuid
  `.execute(database);
  const row = result.rows[0];
  if (row) {
    return {
      today: row.today,
      dailyGoalMinutes: row.daily_goal_minutes,
      shared: row.progress_shared,
    };
  }
  const utc = await sql<{ today: string }>`
    select to_char((now() at time zone 'UTC')::date, 'YYYY-MM-DD') as today
  `.execute(database);
  return { today: utc.rows[0]!.today, dailyGoalMinutes: null, shared: false };
}

/** The days in a range that have something recorded, oldest first. */
export async function listDailyActivity(
  database: DatabaseExecutor,
  input: { userId: string; from: string; to: string },
) {
  const result = await sql<{
    activity_date: string;
    seconds: number;
    completions: number;
    goal_minutes: number | null;
  }>`
    select
      to_char(activity_date, 'YYYY-MM-DD') as activity_date,
      seconds,
      completions,
      goal_minutes
    from learning_daily_activity
    where user_id = ${input.userId}::uuid
      and activity_date >= ${input.from}::date
      and activity_date <= ${input.to}::date
      and (seconds > 0 or completions > 0)
    order by activity_date
  `.execute(database);
  return result.rows;
}

/** The same days split by course; within a day, the longest first. */
export async function listDailyCourseActivity(
  database: DatabaseExecutor,
  input: { userId: string; from: string; to: string },
) {
  const result = await sql<{
    activity_date: string;
    course_id: string;
    seconds: number;
    completions: number;
  }>`
    select
      to_char(activity_date, 'YYYY-MM-DD') as activity_date,
      course_id,
      seconds,
      completions
    from learning_daily_course_activity
    where user_id = ${input.userId}::uuid
      and activity_date >= ${input.from}::date
      and activity_date <= ${input.to}::date
      and (seconds > 0 or completions > 0)
    order by activity_date, seconds desc, course_id
  `.execute(database);
  return result.rows;
}

/**
 * Turns sharing on or off. A learner with nothing stored gets a row, with
 * the zone given (their device's) rather than the column's UTC default.
 */
export async function setProgressShared(
  database: DatabaseExecutor,
  input: { userId: string; shared: boolean; timeZone: string },
): Promise<boolean> {
  const row = await database
    .insertInto("user_learning_settings")
    .values({
      user_id: input.userId,
      daily_goal_minutes: null,
      time_zone: input.timeZone,
      progress_shared: input.shared,
    })
    .onConflict((conflict) =>
      conflict.column("user_id").doUpdateSet({
        progress_shared: input.shared,
        updated_at: new Date(),
      }),
    )
    .returning("progress_shared")
    .executeTakeFirstOrThrow();
  return row.progress_shared;
}

/**
 * The members who share their progress, each with their last seven days
 * (in their own calendar), the one who learned most first.
 */
export async function listSharingLearners(
  database: DatabaseExecutor,
  input: { defaultGoalMinutes: number; limit: number },
) {
  const result = await sql<{
    user_id: string;
    goal_minutes: number;
    today_seconds: number;
    week_seconds: number;
    week_goals_met: number;
  }>`
    select
      s.user_id,
      coalesce(s.daily_goal_minutes, ${input.defaultGoalMinutes})::int
        as goal_minutes,
      coalesce(
        sum(a.seconds) filter (where a.activity_date = day.today), 0
      )::int as today_seconds,
      coalesce(sum(a.seconds), 0)::int as week_seconds,
      count(a.activity_date) filter (
        where a.seconds
          >= coalesce(a.goal_minutes, ${input.defaultGoalMinutes}) * 60
      )::int as week_goals_met
    from user_learning_settings s
    cross join lateral (
      select greatest(
        (now() at time zone s.time_zone)::date,
        coalesce(s.accrual_floor_date, '-infinity'::date)
      ) as today
    ) day
    left join learning_daily_activity a
      on a.user_id = s.user_id
      and a.activity_date >= day.today - 6
      and a.activity_date <= day.today
    where s.progress_shared
    group by s.user_id, s.daily_goal_minutes
    order by week_seconds desc, s.user_id
    limit ${input.limit}
  `.execute(database);
  return result.rows;
}
