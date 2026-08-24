import { sql, type Kysely } from "kysely";

/**
 * Guards against double-queuing a transcode job for the same video: the
 * existence check + insert in media.service.ts's queueTranscodeJob is not
 * transactional, so two near-simultaneous calls (client retry, or a manual
 * lesson update racing the automatic confirm-upload dispatch) could both
 * insert an active job and both trigger a duplicate transcode dispatch. A
 * partial unique index makes the second insert fail at the DB level instead.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    create unique index video_jobs_active_video_id_unique
      on video_jobs (video_id)
      where status in ('QUEUED', 'PROVISIONING', 'PROCESSING')
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    drop index if exists video_jobs_active_video_id_unique
  `.execute(database);
}
