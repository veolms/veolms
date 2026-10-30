import { sql, type Kysely } from "kysely";

/**
 * 1. video_jobs.provider_job_id — the transcoding provider's own job id
 *    (e.g. AWS MediaConvert's), captured at dispatch. Cancellation was
 *    previously sent with VeoLMS's internal uuid, which the provider has
 *    never heard of, so cancelled jobs kept transcoding (and billing) at
 *    AWS to completion.
 * 2. video_jobs.video_metadata — schema drift fix: the column is declared
 *    in the TypeScript schema and written by media.repository, but the
 *    migration meant to create it (008-add-hardware-sizing) is a no-op,
 *    so it only exists on databases where it was added manually.
 * 3. Drops single-column indexes that are exact prefixes of an existing
 *    composite (or unique) index on the same table — identified in the
 *    2026-10 performance audit. They serve no query a wider index cannot,
 *    and each one is pure write amplification.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table video_jobs
      add column if not exists provider_job_id text
  `.execute(database);

  await sql`
    alter table video_jobs
      add column if not exists video_metadata jsonb
  `.execute(database);

  for (const name of [
    // ⊂ idx_course_sections_course_position (course_id, position)
    "idx_course_sections_course_id",
    // ⊂ idx_course_lessons_section_position (section_id, position)
    "idx_course_lessons_section_id",
    // ⊂ idx_enrollments_course_created (course_id, created_at)
    "idx_enrollments_course_id",
    // ⊂ idx_order_items_order_course (order_id, course_id)
    "idx_order_items_order_id",
    // ⊂ quizzes_creator_deleted_updated_idx / quizzes_academy_deleted_updated_idx
    "quizzes_creator_idx",
    "quizzes_academy_idx",
    // ⊂ quiz_questions_version_deleted_position_idx
    "quiz_questions_version_idx",
    // ⊂ quiz_question_options_question_position_idx
    "quiz_question_options_question_idx",
    // ⊂ quiz_assignments_course_created_idx / quiz_assignments_quiz_created_idx
    "quiz_assignments_course_idx",
    "quiz_assignments_quiz_idx",
    // ⊂ unique (assignment_id, user_id, attempt_number) and *_created_idx
    "quiz_attempts_assignment_idx",
    "quiz_attempts_user_idx",
    // ⊂ unique (user_id, course_id, lesson_id)
    "idx_learning_progress_user_course",
  ]) {
    await sql`drop index if exists ${sql.raw(name)}`.execute(database);
  }
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`alter table video_jobs drop column if exists provider_job_id`.execute(
    database,
  );
  // video_metadata is intentionally kept on down: application code reads it.

  await sql`create index if not exists idx_course_sections_course_id on course_sections (course_id)`.execute(
    database,
  );
  await sql`create index if not exists idx_course_lessons_section_id on course_lessons (section_id)`.execute(
    database,
  );
  await sql`create index if not exists idx_enrollments_course_id on enrollments (course_id)`.execute(
    database,
  );
  await sql`create index if not exists idx_order_items_order_id on order_items (order_id)`.execute(
    database,
  );
  await sql`create index if not exists quizzes_creator_idx on quizzes (creator_id)`.execute(
    database,
  );
  await sql`create index if not exists quizzes_academy_idx on quizzes (academy_id)`.execute(
    database,
  );
  await sql`create index if not exists quiz_questions_version_idx on quiz_questions (quiz_version_id)`.execute(
    database,
  );
  await sql`create index if not exists quiz_question_options_question_idx on quiz_question_options (question_id)`.execute(
    database,
  );
  await sql`create index if not exists quiz_assignments_course_idx on quiz_assignments (course_id)`.execute(
    database,
  );
  await sql`create index if not exists quiz_assignments_quiz_idx on quiz_assignments (quiz_id)`.execute(
    database,
  );
  await sql`create index if not exists quiz_attempts_assignment_idx on quiz_attempts (assignment_id)`.execute(
    database,
  );
  await sql`create index if not exists quiz_attempts_user_idx on quiz_attempts (user_id)`.execute(
    database,
  );
  await sql`create index if not exists idx_learning_progress_user_course on learning_progress (user_id, course_id)`.execute(
    database,
  );
}
