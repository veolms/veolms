import { sql, type Kysely } from "kysely";

/**
 * Uploaded pictures were queued in `image_jobs` and left at "processing",
 * but nothing processes that queue any more: the CDN Worker makes a
 * picture's sizes when they are first asked for. A course whose thumbnail
 * was stuck that way could not be published. Uploads are now ready at once;
 * this releases the pictures already stuck, and their queued jobs.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    update media_assets
      set status = 'ready', updated_at = now()
      where type = 'image' and status = 'processing'
  `.execute(database);
  await sql`
    update image_jobs
      set status = 'completed', completed_at = now(), updated_at = now()
      where status in ('queued', 'processing')
  `.execute(database);
}

/** The pictures were in storage all along; there is nothing to undo. */
export async function down(): Promise<void> {}
