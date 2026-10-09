import { sql } from "kysely";
import type { DatabaseExecutor } from "@veolms/database";

export type LearningProgressExecutor = DatabaseExecutor;

export function listUserCourseProgress(
  database: LearningProgressExecutor,
  userId: string,
  courseId: string,
) {
  return database
    .selectFrom("learning_progress")
    .select(["lesson_id", "progress_percent", "updated_at"])
    .where("user_id", "=", userId)
    .where("course_id", "=", courseId)
    .execute();
}

export type LearningProgressRow = Awaited<
  ReturnType<typeof listUserCourseProgress>
>[number];

function toIdList(courseId: string | string[] | undefined): string[] {
  if (!courseId) return [];
  return Array.isArray(courseId) ? courseId : [courseId];
}

/** Same (user, course) grouping as above, reduced to two
 * scalars instead of buckets. `asOf`, when given, restricts to progress rows
 * first recorded by that date — an approximate "as it stood on that date"
 * snapshot, used to compare a completion rate now vs. at the start of the
 * previous period. */
export async function getAverageProgressAndCompletionRate(
  database: LearningProgressExecutor,
  filters: { courseId?: string | string[]; asOf?: Date } = {},
): Promise<{ averageProgressPercent: number; completionRate: number }> {
  const courseIds = toIdList(filters.courseId);

  // Both reductions happen in SQL. The previous shape returned one row per
  // (user, course) pair and reduced in JS — tens of thousands of rows PER
  // CALL at modest scale, and the dashboard/overview issue several of
  // these per request (measured: 1,200ms row-shipping vs 105ms SQL-side on
  // a 1M-row dataset). The math is identical: average of per-(user,course)
  // averages, completion = share of pairs at >= 100.
  let inner = database
    .selectFrom("learning_progress")
    .select([
      "user_id",
      "course_id",
      sql<number>`avg(progress_percent)`.as("avg_percent"),
    ])
    .groupBy(["user_id", "course_id"]);
  if (courseIds.length > 0) {
    inner = inner.where("course_id", "in", courseIds);
  }
  if (filters.asOf) {
    inner = inner.where("created_at", "<=", filters.asOf);
  }

  const row = await database
    .selectFrom(inner.as("per_user_course"))
    .select([
      sql<number>`coalesce(avg(avg_percent), 0)`.as("average_progress"),
      sql<number>`coalesce(
        100.0 * count(*) filter (where avg_percent >= 100) / nullif(count(*), 0),
        0
      )`.as("completion_rate"),
    ])
    .executeTakeFirst();

  return {
    averageProgressPercent: Number(row?.average_progress ?? 0),
    completionRate: Number(row?.completion_rate ?? 0),
  };
}

/**
 * Per-course variant of getAverageProgressAndCompletionRate, one grouped
 * query for the whole id list — the course-performance table previously
 * called the scalar variant once per course.
 */
export async function getAverageProgressAndCompletionRateByCourse(
  database: LearningProgressExecutor,
  courseId: string | string[],
): Promise<
  Array<{
    courseId: string;
    averageProgressPercent: number;
    completionRate: number;
  }>
> {
  const courseIds = toIdList(courseId);
  if (courseIds.length === 0) return [];

  const inner = database
    .selectFrom("learning_progress")
    .select([
      "course_id",
      "user_id",
      sql<number>`avg(progress_percent)`.as("avg_percent"),
    ])
    .where("course_id", "in", courseIds)
    .groupBy(["course_id", "user_id"]);

  const rows = await database
    .selectFrom(inner.as("per_user_course"))
    .select([
      "course_id",
      sql<number>`avg(avg_percent)`.as("average_progress"),
      sql<number>`100.0 * count(*) filter (where avg_percent >= 100) / count(*)`.as(
        "completion_rate",
      ),
    ])
    .groupBy("course_id")
    .execute();

  return rows.map((row) => ({
    courseId: row.course_id,
    averageProgressPercent: Number(row.average_progress),
    completionRate: Number(row.completion_rate),
  }));
}

export async function getAverageProgressByCourse(
  database: LearningProgressExecutor,
  filters: { courseId?: string | string[] } = {},
): Promise<Array<{ courseId: string; averageProgressPercent: number }>> {
  const courseIds = toIdList(filters.courseId);
  if (courseIds.length === 0) return [];

  // Outer average computed in SQL — see getAverageProgressAndCompletionRate
  // for why (this used to ship one row per user x course to Node).
  const inner = database
    .selectFrom("learning_progress")
    .select([
      "course_id",
      "user_id",
      sql<number>`avg(progress_percent)`.as("avg_percent"),
    ])
    .where("course_id", "in", courseIds)
    .groupBy(["course_id", "user_id"]);

  const rows = await database
    .selectFrom(inner.as("per_user_course"))
    .select(["course_id", sql<number>`avg(avg_percent)`.as("average_progress")])
    .groupBy("course_id")
    .execute();

  return rows.map((row) => ({
    courseId: row.course_id,
    averageProgressPercent: Number(row.average_progress),
  }));
}

/**
 * Distinct-user counts of progress *events* (not full-course averages) in a
 * date range — a simplified stand-in for a per-cohort "started"/"completed"
 * learning funnel: started = touched any lesson, completed = any lesson hit
 * 100% during the window.
 */
export async function getStartedAndCompletedCounts(
  database: LearningProgressExecutor,
  filters: { courseId?: string | string[]; from?: Date; to?: Date },
): Promise<{ started: number; completed: number }> {
  const courseIds = toIdList(filters.courseId);
  let query = database
    .selectFrom("learning_progress")
    .select([
      sql<number>`count(distinct user_id) filter (where progress_percent > 0)::int`.as(
        "started",
      ),
      sql<number>`count(distinct user_id) filter (where progress_percent >= 100)::int`.as(
        "completed",
      ),
    ]);
  if (courseIds.length > 0) {
    query = query.where("course_id", "in", courseIds);
  }
  if (filters.from) {
    query = query.where("updated_at", ">=", filters.from);
  }
  if (filters.to) {
    query = query.where("updated_at", "<=", filters.to);
  }
  const row = await query.executeTakeFirst();
  return {
    started: Number(row?.started ?? 0),
    completed: Number(row?.completed ?? 0),
  };
}

/**
 * Sum of (lesson duration * progress fraction) across matching progress
 * rows, in hours — an estimate derived from stored lesson durations and
 * recorded progress percentages, not real playback telemetry (VeoLMS
 * doesn't currently track actual seconds watched).
 */
export async function getEstimatedWatchHours(
  database: LearningProgressExecutor,
  filters: { courseId?: string | string[]; from?: Date; to?: Date },
): Promise<number> {
  const courseIds = toIdList(filters.courseId);
  let query = database
    .selectFrom("learning_progress as lp")
    .innerJoin("course_lessons as cl", "cl.id", "lp.lesson_id")
    .leftJoin("media_assets as ma", "ma.id", "cl.content_media_id")
    .select(
      sql<number>`coalesce(sum(coalesce(ma.duration_seconds, 0) * lp.progress_percent / 100.0), 0)`.as(
        "seconds",
      ),
    );
  if (courseIds.length > 0) {
    query = query.where("lp.course_id", "in", courseIds);
  }
  if (filters.from) {
    query = query.where("lp.updated_at", ">=", filters.from);
  }
  if (filters.to) {
    query = query.where("lp.updated_at", "<=", filters.to);
  }
  const row = await query.executeTakeFirst();
  return Number(row?.seconds ?? 0) / 3600;
}

// ---------------------------------------------------------------------------
// Learning goals & daily activity (approved PRD, 2026-10)
// ---------------------------------------------------------------------------

export interface DailyActivityAccrual {
  /** Learner-local day credited (YYYY-MM-DD). */
  activity_date: string;
  /** Day totals AFTER this batch (not the batch's own contribution). */
  seconds: number;
  completions: number;
  /** Day totals BEFORE this batch (0 on the day's first credit). */
  previous_seconds: number;
  previous_completions: number;
}

/**
 * The heartbeat write path: one atomic statement that
 *  1. upserts progress with a monotonic GREATEST rule (a replayed batch, a
 *     retry or an older browser tab can never move a learner backwards),
 *     capturing each row's old/new percent (PostgreSQL 18
 *     `RETURNING old/new`);
 *  2. converts the percent gained into seconds via the lesson's media
 *     duration (delta% x duration, completions = newly reached 100);
 *  3. credits learning_daily_activity for the user's CURRENT local day,
 *     resolving the IANA zone from user_learning_settings inline (UTC
 *     when the user has no settings row).
 *
 *  4. queues the goal-completed event when this batch takes the day's
 *     total across the learner's goal. Queued after the accrual had
 *     committed, a failure in between lost the event for good — the goal
 *     is only crossed once.
 *
 * Seconds credited by one batch are capped by the time since the learner's
 * previous heartbeat (see ACCRUAL_* below). Progress is a position the
 * client reports, so without the cap a single request claiming 100% was
 * credited the whole lesson at once.
 *
 * A replayed/retried batch yields old = new (delta 0), so nothing is
 * credited twice — idempotent by construction. Single statement means
 * atomicity without transaction round-trips (measured: a separate
 * read+BEGIN/COMMIT flow cost ~12% heartbeat throughput).
 *
 * Returns the credited day's NEW totals, or null when the batch earned
 * nothing (replay or zero-delta) — callers use this for goal/streak
 * threshold checks.
 */
/** Fastest preset the player offers: content watched per second of time. */
const ACCRUAL_MAX_PLAYBACK_RATE = 3;
/** Allowance for clock skew and the heartbeat's own latency. */
const ACCRUAL_SLACK_SECONDS = 30;
/** A gap longer than this earns no more than the gap itself would. */
const ACCRUAL_MAX_GAP_SECONDS = 2 * 60 * 60;
/** What a learner's very first heartbeat may claim. */
const ACCRUAL_FIRST_HEARTBEAT_SECONDS = 5 * 60;

export async function upsertProgressAndAccrueActivity(
  database: LearningProgressExecutor,
  userId: string,
  values: Array<{
    id: string;
    user_id: string;
    course_id: string;
    lesson_id: string;
    progress_percent: number;
    created_at: Date;
    updated_at: Date;
  }>,
  /**
   * Seconds of video the page reports as actually played (media time) since
   * its last report. When given, this is what the day is credited with, and
   * progress earns nothing by itself: skipping ahead on the timeline raises
   * progress without a second being watched. When undefined the page is an
   * older one that does not measure it, and the day is credited from the
   * progress gained, as before. Either way the allowance below caps it.
   */
  watchedSeconds?: number,
): Promise<DailyActivityAccrual | null> {
  const reportsWatchTime = watchedSeconds !== undefined;
  if (values.length === 0 && !(reportsWatchTime && watchedSeconds >= 1)) {
    return null;
  }

  // A batch may carry watch time alone (a lesson replayed after it is
  // complete moves no progress): then there is nothing to upsert.
  const upserted =
    values.length > 0
      ? sql`
      insert into learning_progress
        (id, user_id, course_id, lesson_id, progress_percent, created_at, updated_at)
      values ${sql.join(
        values.map(
          (v) =>
            sql`(${v.id}::uuid, ${v.user_id}::uuid, ${v.course_id}::uuid, ${v.lesson_id}::uuid, ${v.progress_percent}::int, ${v.created_at}::timestamptz, ${v.updated_at}::timestamptz)`,
        ),
      )}
      on conflict (user_id, course_id, lesson_id) do update set
        progress_percent = GREATEST(learning_progress.progress_percent, EXCLUDED.progress_percent),
        updated_at = EXCLUDED.updated_at
      returning
        new.lesson_id as lesson_id,
        old.progress_percent as previous_percent,
        new.progress_percent as current_percent`
      : sql`
      select
        null::uuid as lesson_id,
        null::int as previous_percent,
        null::int as current_percent
      where false`;
  // What the batch claims to have earned, before the allowance caps it.
  const claimedSeconds = reportsWatchTime
    ? sql`${watchedSeconds}::numeric`
    : sql`coalesce(sum(
            greatest(0, u.current_percent - coalesce(u.previous_percent, 0)) / 100.0
              * coalesce(ma.duration_seconds, 0)
          ), 0)`;

  const result = await sql<DailyActivityAccrual>`
    with previous as (
      -- Read before the upsert below takes effect: every part of one
      -- statement sees the same snapshot.
      select max(updated_at) as last_at
      from learning_progress
      where user_id = ${userId}::uuid
    ),
    allowance as (
      select case
        when last_at is null then ${ACCRUAL_FIRST_HEARTBEAT_SECONDS}::numeric
        else least(
          greatest(extract(epoch from (now() - last_at)), 0),
          ${ACCRUAL_MAX_GAP_SECONDS}
        ) * ${ACCRUAL_MAX_PLAYBACK_RATE} + ${ACCRUAL_SLACK_SECONDS}
      end as seconds
      from previous
    ),
    upserted as (${upserted}
    ),
    credit as (
      select
        least(
          ${claimedSeconds},
          (select seconds from allowance)
        ) as earned_seconds,
        count(*) filter (
          where u.current_percent >= 100 and coalesce(u.previous_percent, 0) < 100
        ) as completions
      from upserted u
      left join course_lessons cl on cl.id = u.lesson_id
      left join media_assets ma on ma.id = cl.content_media_id
    ),
    accrued as (
    insert into learning_daily_activity (user_id, activity_date, seconds, completions)
    select
      ${userId}::uuid,
      -- The learner's local day, but never one before the day it was when
      -- they last changed time zone (see accrual_floor_date).
      coalesce(
        (
          select greatest(
            (now() at time zone s.time_zone)::date,
            coalesce(s.accrual_floor_date, '-infinity'::date)
          )
          from user_learning_settings s where s.user_id = ${userId}::uuid
        ),
        (now() at time zone 'UTC')::date
      ),
      floor(credit.earned_seconds)::int,
      credit.completions::int
    from credit
    where credit.earned_seconds >= 1 or credit.completions > 0
    on conflict (user_id, activity_date) do update set
      seconds = learning_daily_activity.seconds + EXCLUDED.seconds,
      completions = learning_daily_activity.completions + EXCLUDED.completions
    returning
      to_char(new.activity_date, 'YYYY-MM-DD') as activity_date,
      new.seconds as seconds,
      new.completions as completions,
      coalesce(old.seconds, 0) as previous_seconds,
      coalesce(old.completions, 0) as previous_completions
    ),
    goal_event as (
      -- Same row shape as the outbox's own createEvent; the dedupe key
      -- makes it once per learner per local day.
      insert into outbox_events
        (id, event_type, event_version, dedupe_key, payload, occurred_at)
      select
        gen_random_uuid(),
        'learning.goal_completed',
        1,
        'learning.goal_completed:' || ${userId}::text || ':' || a.activity_date,
        jsonb_build_object(
          'recipientUserId', ${userId}::text,
          'dailyGoalMinutes', s.daily_goal_minutes,
          'localDate', a.activity_date
        ),
        now()
      from accrued a
      join user_learning_settings s on s.user_id = ${userId}::uuid
      where s.daily_goal_minutes is not null
        and a.previous_seconds < s.daily_goal_minutes * 60
        and a.seconds >= s.daily_goal_minutes * 60
      on conflict (dedupe_key) do nothing
    )
    select * from accrued
  `.execute(database);

  const accrual = result.rows[0];
  if (!accrual) return null;
  return {
    activity_date: accrual.activity_date,
    seconds: Number(accrual.seconds),
    completions: Number(accrual.completions),
    previous_seconds: Number(accrual.previous_seconds),
    previous_completions: Number(accrual.previous_completions),
  };
}

/** What the service reads of a learner's settings, on reads and after a save. */
const USER_LEARNING_SETTINGS_COLUMNS = [
  "daily_goal_minutes",
  "reminders_enabled",
  "reminder_days",
  "reminder_time",
  "time_zone",
  "accrual_floor_date",
] as const;

export async function findUserLearningSettings(
  database: LearningProgressExecutor,
  userId: string,
) {
  return database
    .selectFrom("user_learning_settings")
    .select(USER_LEARNING_SETTINGS_COLUMNS)
    .where("user_id", "=", userId)
    .executeTakeFirst();
}

export async function upsertUserLearningSettings(
  database: LearningProgressExecutor,
  values: {
    user_id: string;
    daily_goal_minutes: number | null;
    reminders_enabled: boolean;
    reminder_days: string[];
    reminder_time: string;
    time_zone: string;
  },
) {
  return database
    .insertInto("user_learning_settings")
    .values(values)
    .onConflict((conflict) =>
      conflict.column("user_id").doUpdateSet({
        daily_goal_minutes: values.daily_goal_minutes,
        reminders_enabled: values.reminders_enabled,
        reminder_days: values.reminder_days,
        reminder_time: values.reminder_time,
        time_zone: values.time_zone,
        // A zone change pins the floor to the day it is in the zone being
        // left, so the new zone cannot reopen a day that has already ended.
        accrual_floor_date: sql<Date | null>`
          case
            when user_learning_settings.time_zone is distinct from excluded.time_zone
            then greatest(
              coalesce(user_learning_settings.accrual_floor_date, '-infinity'::date),
              (now() at time zone user_learning_settings.time_zone)::date
            )
            else user_learning_settings.accrual_floor_date
          end`,
        updated_at: new Date(),
      }),
    )
    .returning(USER_LEARNING_SETTINGS_COLUMNS)
    .executeTakeFirstOrThrow();
}

/**
 * Sets the learner's zone only if they have no settings row yet. Returns
 * whether a row was created.
 */
export async function seedUserTimeZone(
  database: LearningProgressExecutor,
  userId: string,
  timeZone: string,
): Promise<boolean> {
  const inserted = await database
    .insertInto("user_learning_settings")
    .values({ user_id: userId, daily_goal_minutes: null, time_zone: timeZone })
    .onConflict((conflict) => conflict.column("user_id").doNothing())
    .returning("user_id")
    .executeTakeFirst();
  return inserted !== undefined;
}

/**
 * Which of these zone ids Postgres can bucket days in. JavaScript's `Intl`
 * accepts ids Postgres rejects ("CTT"), and `at time zone` throws on those.
 */
export async function listSupportedTimeZones(
  database: LearningProgressExecutor,
  candidates: readonly string[],
): Promise<string[]> {
  if (candidates.length === 0) return [];
  const result = await sql<{ name: string }>`
    select name from pg_timezone_names
    where name = any(${[...candidates]}::text[])
  `.execute(database);
  return result.rows.map((row) => row.name);
}

/**
 * Today's and the last seven days' totals, and the current and best streak,
 * in ONE round trip, in the user's local calendar (PRD §9). Streak days are
 * days with >= 60 seconds or >= 1 completion; the current streak counts
 * back from today or yesterday (today is not over yet). Gaps-and-islands
 * over the user's own rows — bounded by days of history, PK-indexed.
 */
export async function getLearningSummaryAggregates(
  database: LearningProgressExecutor,
  input: {
    userId: string;
    timeZone: string;
    /** `accrual_floor_date` — "today" is never before it. */
    floorDate?: Date | null;
  },
): Promise<{
  todaySeconds: number;
  weekSeconds: number;
  currentStreakDays: number;
  bestStreakDays: number;
}> {
  const result = await sql<{
    today_seconds: number;
    week_seconds: number;
    current_streak: number;
    best_streak: number;
  }>`
    with local_today as (
      -- Same day the accrual credits to, so today's ring shows it.
      select greatest(
        (now() at time zone ${input.timeZone})::date,
        coalesce(${input.floorDate ?? null}::date, '-infinity'::date)
      ) as today
    ),
    qualifying as (
      select activity_date
      from learning_daily_activity
      where user_id = ${input.userId}::uuid
        and (seconds >= 60 or completions >= 1)
    ),
    islands as (
      select
        activity_date,
        activity_date
          - (row_number() over (order by activity_date))::int as grp
      from qualifying
    ),
    streaks as (
      select max(activity_date) as end_date,
             count(*)::int as len
      from islands
      group by grp
    )
    select
      coalesce((
        select seconds from learning_daily_activity, local_today
        where user_id = ${input.userId}::uuid and activity_date = today
      ), 0)::int as today_seconds,
      coalesce((
        select sum(seconds) from learning_daily_activity, local_today
        where user_id = ${input.userId}::uuid
          and activity_date >= today - 6
          and activity_date <= today
      ), 0)::int as week_seconds,
      coalesce((
        select len from streaks, local_today
        where end_date >= today - 1
        order by end_date desc limit 1
      ), 0)::int as current_streak,
      coalesce((select max(len) from streaks), 0)::int as best_streak
  `.execute(database);

  const row = result.rows[0];
  return {
    todaySeconds: Number(row?.today_seconds ?? 0),
    weekSeconds: Number(row?.week_seconds ?? 0),
    currentStreakDays: Number(row?.current_streak ?? 0),
    bestStreakDays: Number(row?.best_streak ?? 0),
  };
}
