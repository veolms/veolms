import { sql, type Kysely } from "kysely";

/**
 * Workshops no longer ask anyone to register: everyone in a workshop's
 * audience (every learner, a course's learners, or buyers) is in and gets
 * the calendar invitation. A learner who will not come says so, and that
 * is kept here so they get no more reminders or notices about it.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table workshop_registrations
      add column if not exists declined_at timestamptz
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table workshop_registrations drop column if exists declined_at
  `.execute(database);
}
