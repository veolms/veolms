import { sql, type Kysely } from "kysely";

/**
 * Whether a course's learners hear about its quizzes (a new quiz, a quiz
 * passed or failed for good). Off unless the course's admin turns it on:
 * a new quiz used to notify every learner of the course (22 Nov 2026).
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table course_settings
      add column if not exists quiz_notifications_enabled boolean not null default false
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table course_settings drop column if exists quiz_notifications_enabled
  `.execute(database);
}
