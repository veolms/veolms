import { sql, type Kysely } from "kysely";

/**
 * Tracks which lesson a session is currently playing, and when that claim
 * was made. The learning-progress batch uses these to enforce the
 * "Streams at a time" platform setting: the newest play wins, and older
 * devices are asked to pause.
 *
 * All three columns are nullable so no existing session row is touched.
 * There is no foreign key on `playing_lesson_id` because a deleted lesson
 * should not invalidate an active claim; it simply shows no title.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table sessions
      add column if not exists playing_lesson_id uuid,
      add column if not exists playing_claimed_at timestamptz,
      add column if not exists playing_at timestamptz
  `.execute(database);

  await sql`
    create index if not exists sessions_playing_idx
      on sessions (user_id, playing_at)
      where playing_at is not null
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    drop index if exists sessions_playing_idx
  `.execute(database);

  await sql`
    alter table sessions
      drop column if exists playing_lesson_id,
      drop column if exists playing_claimed_at,
      drop column if exists playing_at
  `.execute(database);
}
