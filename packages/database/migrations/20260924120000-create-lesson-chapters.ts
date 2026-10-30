import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS lesson_chapters (
      id UUID PRIMARY KEY,
      lesson_id UUID NOT NULL
        REFERENCES course_lessons(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      start_seconds INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      CONSTRAINT lesson_chapters_start_seconds_check
        CHECK (start_seconds >= 0),
      CONSTRAINT lesson_chapters_lesson_start_unique
        UNIQUE (lesson_id, start_seconds)
    )
  `.execute(database);

  await sql`
    CREATE INDEX IF NOT EXISTS idx_lesson_chapters_lesson_order
      ON lesson_chapters (lesson_id, start_seconds, id)
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS lesson_chapters`.execute(database);
}
