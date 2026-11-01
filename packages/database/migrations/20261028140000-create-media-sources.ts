import { sql, type Kysely } from "kysely";

/**
 * Where a video came from: for a video imported from YouTube, the video's
 * id and link (and its title and channel as YouTube showed them), so the
 * people who manage a course can tell which YouTube video a lesson holds.
 *
 * - One row per video, kept with the video: deleting the video deletes it,
 *   and a lesson whose video is replaced shows the new video's source.
 * - `recorded_via` says how it was learned: the lesson editor's import,
 *   the playlist CLI, or this backfill.
 * - Backfilled from `youtube_import_jobs`, which already holds the link of
 *   every video imported from the lesson editor. Videos the playlist CLI
 *   imported before this kept no link, so they start without a source.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    create table if not exists media_sources (
      media_id uuid primary key references media_assets (id) on delete cascade,
      provider text not null,
      external_id text not null,
      source_url text not null,
      title text,
      channel text,
      recorded_via text not null,
      created_at timestamptz not null default current_timestamp,
      constraint media_sources_provider_valid check (provider in ('youtube')),
      constraint media_sources_recorded_via_valid check (
        recorded_via in ('import', 'cli', 'backfill')
      )
    )
  `.execute(database);
  // "Is this YouTube video already used?"
  await sql`
    create index if not exists idx_media_sources_provider_external_id
      on media_sources (provider, external_id)
  `.execute(database);

  await sql`
    insert into media_sources (
      media_id, provider, external_id, source_url, title, recorded_via, created_at
    )
    select
      youtube_import_jobs.media_id,
      'youtube',
      youtube_import_jobs.youtube_id,
      youtube_import_jobs.source_url,
      youtube_import_jobs.title,
      'backfill',
      youtube_import_jobs.created_at
    from youtube_import_jobs
    on conflict (media_id) do nothing
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop table if exists media_sources`.execute(database);
}
