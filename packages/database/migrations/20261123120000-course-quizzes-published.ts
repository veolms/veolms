import { sql, type Kysely } from "kysely";

/**
 * Whether a course's quizzes are shown to its learners (owner, 23 Nov
 * 2026): an admin can keep all of a course's quizzes in draft while
 * preparing them. On for every existing course, so nothing a learner can
 * see today disappears. Each quiz also has its own draft/published status
 * (quizzes.status); a learner sees a quiz only when both are published.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table course_settings
      add column if not exists quizzes_published boolean not null default true
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table course_settings drop column if exists quizzes_published
  `.execute(database);
}
