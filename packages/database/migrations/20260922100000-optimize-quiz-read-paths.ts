import type { Kysely } from "kysely";

/**
 * Read-path indexes for the Quiz authoring, learner and analytics queries.
 * Existing single-column indexes remain in place for other access patterns;
 * these composites cover the common equality-filter plus ordering patterns.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createIndex("quizzes_creator_deleted_updated_idx")
    .on("quizzes")
    .columns(["creator_id", "deleted_at", "updated_at"])
    .execute();
  await db.schema
    .createIndex("quizzes_academy_deleted_updated_idx")
    .on("quizzes")
    .columns(["academy_id", "deleted_at", "updated_at"])
    .execute();
  await db.schema
    .createIndex("quiz_questions_version_deleted_position_idx")
    .on("quiz_questions")
    .columns(["quiz_version_id", "deleted_at", "position"])
    .execute();
  await db.schema
    .createIndex("quiz_question_options_question_position_idx")
    .on("quiz_question_options")
    .columns(["question_id", "position"])
    .execute();
  await db.schema
    .createIndex("quiz_assignments_course_created_idx")
    .on("quiz_assignments")
    .columns(["course_id", "created_at"])
    .execute();
  await db.schema
    .createIndex("quiz_assignments_quiz_created_idx")
    .on("quiz_assignments")
    .columns(["quiz_id", "created_at"])
    .execute();
  await db.schema
    .createIndex("quiz_attempts_assignment_created_idx")
    .on("quiz_attempts")
    .columns(["assignment_id", "created_at"])
    .execute();
  await db.schema
    .createIndex("quiz_attempts_user_created_idx")
    .on("quiz_attempts")
    .columns(["user_id", "created_at"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .dropIndex("quiz_attempts_user_created_idx")
    .ifExists()
    .execute();
  await db.schema
    .dropIndex("quiz_attempts_assignment_created_idx")
    .ifExists()
    .execute();
  await db.schema
    .dropIndex("quiz_assignments_quiz_created_idx")
    .ifExists()
    .execute();
  await db.schema
    .dropIndex("quiz_assignments_course_created_idx")
    .ifExists()
    .execute();
  await db.schema
    .dropIndex("quiz_question_options_question_position_idx")
    .ifExists()
    .execute();
  await db.schema
    .dropIndex("quiz_questions_version_deleted_position_idx")
    .ifExists()
    .execute();
  await db.schema
    .dropIndex("quizzes_academy_deleted_updated_idx")
    .ifExists()
    .execute();
  await db.schema
    .dropIndex("quizzes_creator_deleted_updated_idx")
    .ifExists()
    .execute();
}
