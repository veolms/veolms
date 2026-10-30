import { sql, type Kysely } from "kysely";

/**
 * State for resumable video uploads. `upload_id` is the object store's
 * multipart upload handle; `upload_part_size` is the exact slice size the
 * client must use so a resumed attempt lines up with the parts already
 * accepted. Both are cleared once the upload is completed or abandoned.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table media_assets
      add column if not exists upload_id text,
      add column if not exists upload_part_size integer
  `.execute(database);
  await sql`
    alter table media_assets
      add constraint media_assets_upload_part_size_check
      check (upload_part_size is null or upload_part_size > 0)
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table media_assets
      drop constraint if exists media_assets_upload_part_size_check,
      drop column if exists upload_part_size,
      drop column if exists upload_id
  `.execute(database);
}
