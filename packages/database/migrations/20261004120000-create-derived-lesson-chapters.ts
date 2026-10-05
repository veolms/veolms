import { sql, type Kysely } from "kysely";

/**
 * Chapters are authored only as timestamp lines in the lesson description.
 * This table is a derived cache of that parse so playback can attach one
 * extracted thumbnail per chapter. Rows are replaced whenever the lesson
 * description or video changes; nothing here is edited directly.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS lesson_chapters (
      id UUID PRIMARY KEY,
      lesson_id UUID NOT NULL
        REFERENCES course_lessons(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      start_seconds INTEGER NOT NULL,
      thumbnail_key TEXT,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      CONSTRAINT lesson_chapters_start_seconds_check
        CHECK (start_seconds >= 0),
      CONSTRAINT lesson_chapters_lesson_start_unique
        UNIQUE (lesson_id, start_seconds)
    )
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS lesson_chapters`.execute(database);
}
