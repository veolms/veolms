import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  // Drop the old check constraint
  await sql`
    alter table media_assets
      drop constraint if exists media_assets_status_valid
  `.execute(database);

  // Add the new check constraint supporting 'uploaded'
  await sql`
    alter table media_assets
      add constraint media_assets_status_valid
      check (status in ('uploading', 'uploaded', 'ready', 'failed'))
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table media_assets
      drop constraint if exists media_assets_status_valid
  `.execute(database);

  await sql`
    update media_assets
      set status = 'uploading'
      where status = 'uploaded'
  `.execute(database);

  await sql`
    alter table media_assets
      add constraint media_assets_status_valid
      check (status in ('uploading', 'ready', 'failed'))
  `.execute(database);
}
