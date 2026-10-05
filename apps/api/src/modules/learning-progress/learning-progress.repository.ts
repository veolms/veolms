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

export async function upsertUserCourseProgress(
  database: LearningProgressExecutor,
  values: Array<{
    id: string;
    user_id: string;
    course_id: string;
    lesson_id: string;
    progress_percent: number;
    created_at: Date;
    updated_at: Date;
  }>,
) {
  if (values.length === 0) return;

  await database
    .insertInto("learning_progress")
    .values(values)
    .onConflict((conflict) =>
      conflict.columns(["user_id", "course_id", "lesson_id"]).doUpdateSet({
        // Progress is intentionally monotonic. Replaying a batch, a retry,
        // or an older browser tab can never move a learner backwards.
        progress_percent: sql<number>`GREATEST(learning_progress.progress_percent, EXCLUDED.progress_percent)`,
        updated_at: new Date(),
      }),
    )
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
