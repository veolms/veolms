import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`alter table video_jobs drop constraint if exists video_jobs_status_valid`.execute(
    database,
  );
  await sql`alter table video_jobs add constraint video_jobs_status_valid check (status in ('queued', 'provisioning', 'processing', 'ready', 'completed', 'failed', 'cancelled'))`.execute(
    database,
  );
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`update video_jobs set status = 'processing' where status = 'ready'`.execute(
    database,
  );
  await sql`alter table video_jobs drop constraint if exists video_jobs_status_valid`.execute(
    database,
  );
  await sql`alter table video_jobs add constraint video_jobs_status_valid check (status in ('queued', 'provisioning', 'processing', 'completed', 'failed', 'cancelled'))`.execute(
    database,
  );
}
