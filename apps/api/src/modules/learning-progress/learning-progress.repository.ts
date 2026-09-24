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
    .select(["lesson_id", "progress_percent"])
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
  let query = database
    .selectFrom("learning_progress")
    .select(["user_id", "course_id", sql<number>`avg(progress_percent)`.as("avg_percent")])
    .groupBy(["user_id", "course_id"]);
  if (courseIds.length > 0) {
    query = query.where("course_id", "in", courseIds);
  }
  if (filters.asOf) {
    query = query.where("created_at", "<=", filters.asOf);
  }

  const rows = await query.execute();
  if (rows.length === 0) {
    return { averageProgressPercent: 0, completionRate: 0 };
  }
  const total = rows.reduce((sum, row) => sum + Number(row.avg_percent), 0);
  const completed = rows.filter((row) => Number(row.avg_percent) >= 100).length;
  return {
    averageProgressPercent: total / rows.length,
    completionRate: (completed / rows.length) * 100,
  };
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
  let query = database.selectFrom("learning_progress").select([
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
  return { started: Number(row?.started ?? 0), completed: Number(row?.completed ?? 0) };
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
