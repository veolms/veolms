import { sql, type Kysely } from "kysely";

/**
 * Where in each lesson's video the learner last was, and when, so that a
 * course resumes at its last played lesson, at the same moment, on any
 * device. `progress_percent` is the furthest point reached and only rises;
 * this is the last point watched (which can be earlier, when a part is
 * watched again). The last played lesson of a course is the one whose
 * position was saved last.
 *
 * Both columns are added empty and nullable: no table rewrite, and rows
 * written before this have no position until the lesson is played again.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table learning_progress
      add column if not exists position_seconds integer,
      add column if not exists position_updated_at timestamptz
  `.execute(database);
  await sql`
    alter table learning_progress
      add constraint learning_progress_position_seconds_check
      check (position_seconds is null or position_seconds >= 0)
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table learning_progress
      drop constraint if exists learning_progress_position_seconds_check,
      drop column if exists position_updated_at,
      drop column if exists position_seconds
  `.execute(database);
}
