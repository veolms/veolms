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
