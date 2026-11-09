import { sql, type Kysely } from "kysely";

/**
 * Learners of a workshop's course are included without registering. When
 * one of them presses Join, a registration row with source `course` is
 * written so their attendance shows next to everyone else's. Such rows,
 * like those staff add by hand, never take one of the workshop's seats.
 *
 * A session's recording of a course workshop is also published as a lesson
 * of that course; the lesson is remembered on the session.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table workshop_registrations
      drop constraint if exists workshop_registrations_source_valid,
      add constraint workshop_registrations_source_valid
        check (source in ('free', 'order', 'admin', 'course'))
  `.execute(database);
  await sql`
    alter table workshop_sessions
      add column if not exists recording_lesson_id uuid
        references course_lessons (id) on delete set null
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table workshop_sessions drop column if exists recording_lesson_id
  `.execute(database);
  await sql`delete from workshop_registrations where source = 'course'`.execute(
    database,
  );
  await sql`
    alter table workshop_registrations
      drop constraint if exists workshop_registrations_source_valid,
      add constraint workshop_registrations_source_valid
        check (source in ('free', 'order', 'admin'))
  `.execute(database);
}
