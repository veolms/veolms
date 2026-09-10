import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  // Drop any obsolete trigger/column if previously created
  await sql`
    drop trigger if exists trg_sync_video_jobs_original_file_key on video_jobs;
    drop function if exists sync_video_jobs_original_file_key();
    alter table video_jobs drop column if exists orginal_file_key;
  `.execute(database);

  await sql`
    alter table video_jobs
      add column if not exists original_file_key text;
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table video_jobs
      drop column if exists original_file_key;
  `.execute(database);
}
