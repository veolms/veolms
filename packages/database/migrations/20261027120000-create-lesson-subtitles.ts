import { sql, type Kysely } from "kysely";

/**
 * Subtitle tracks for a lesson's video, as WebVTT files kept in the video's
 * own protected folder (`<output folder>/captions/<language>.vtt`) so the
 * playback token that covers the segments covers them too.
 *
 * A track belongs to one video asset: when the lesson gets a new video the
 * old tracks stop being offered (their timing no longer fits) instead of
 * being moved across.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS lesson_subtitles (
      id UUID PRIMARY KEY,
      lesson_id UUID NOT NULL
        REFERENCES course_lessons(id) ON DELETE CASCADE,
      media_asset_id UUID NOT NULL
        REFERENCES media_assets(id) ON DELETE CASCADE,
      language TEXT NOT NULL,
      label TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'captions',
      storage_key TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      CONSTRAINT lesson_subtitles_kind_check
        CHECK (kind IN ('captions', 'subtitles')),
      CONSTRAINT lesson_subtitles_language_check
        CHECK (language ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
      CONSTRAINT lesson_subtitles_lesson_media_language_unique
        UNIQUE (lesson_id, media_asset_id, language)
    )
  `.execute(database);
  await sql`
    CREATE INDEX IF NOT EXISTS lesson_subtitles_media_asset_id_idx
      ON lesson_subtitles (media_asset_id)
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS lesson_subtitles`.execute(database);
}
