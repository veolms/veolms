import { sql, type Kysely } from "kysely";

/**
 * Questions for a whole course in one go (AI): staff press one button and
 * the AI writes a quiz, and a coding question where the lecture teaches
 * code, for every lecture in course order. Everything it makes is a draft
 * that staff review, edit and publish.
 *
 * - `question_generation_jobs`: one run for one course: who started it,
 *   its settings, how far it got, and a lease so that one API server works
 *   on it at a time (any server may pick it up after a restart).
 * - `question_generation_items`: one row per lecture of the run, in course
 *   order, with what was made for it (or why it was skipped).
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    create table if not exists question_generation_jobs (
      id uuid primary key default gen_random_uuid(),
      course_id uuid not null references courses (id) on delete cascade,
      created_by uuid references users (id) on delete set null,
      status text not null default 'queued',
      settings jsonb not null default '{}'::jsonb,
      total_items integer not null default 0,
      done_items integer not null default 0,
      quizzes_created integer not null default 0,
      coding_created integer not null default 0,
      skipped_items integer not null default 0,
      failed_items integer not null default 0,
      error text,
      lease_until timestamptz,
      started_at timestamptz,
      finished_at timestamptz,
      created_at timestamptz not null default current_timestamp,
      updated_at timestamptz not null default current_timestamp,
      constraint question_generation_jobs_status_valid check (
        status in ('queued', 'running', 'done', 'failed', 'cancelled')
      )
    )
  `.execute(database);
  // One run at a time per course.
  await sql`
    create unique index if not exists question_generation_jobs_one_active
    on question_generation_jobs (course_id)
    where status in ('queued', 'running')
  `.execute(database);
  await sql`
    create index if not exists idx_question_generation_jobs_claim
    on question_generation_jobs (status, lease_until)
  `.execute(database);
  await sql`
    create index if not exists idx_question_generation_jobs_course
    on question_generation_jobs (course_id, created_at desc)
  `.execute(database);

  await sql`
    create table if not exists question_generation_items (
      id uuid primary key default gen_random_uuid(),
      job_id uuid not null references question_generation_jobs (id) on delete cascade,
      lesson_id uuid not null references course_lessons (id) on delete cascade,
      position integer not null,
      status text not null default 'pending',
      quiz_id uuid references quizzes (id) on delete set null,
      coding_exercise_id uuid references coding_exercises (id) on delete set null,
      message text,
      attempts integer not null default 0,
      updated_at timestamptz not null default current_timestamp,
      constraint question_generation_items_status_valid check (
        status in ('pending', 'running', 'done', 'skipped', 'failed')
      ),
      constraint question_generation_items_message_length check (
        message is null or char_length(message) <= 500
      )
    )
  `.execute(database);
  await sql`
    create index if not exists idx_question_generation_items_job
    on question_generation_items (job_id, position)
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop table if exists question_generation_items`.execute(database);
  await sql`drop table if exists question_generation_jobs`.execute(database);
}
