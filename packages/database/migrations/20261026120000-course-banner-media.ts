import { sql, type Kysely } from "kysely";

/**
 * A wide banner picture for a course, shown behind the overview page's hero
 * on desktop. Like the thumbnail it points at an image media asset; the
 * stacked (phone and tablet) layout keeps the thumbnail.
 *
 * Added empty and nullable: no table rewrite, and courses without a banner
 * show the hero as before.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table courses
      add column if not exists banner_media_id uuid
        references media_assets(id) on delete set null
  `.execute(database);
  await sql`
    create index if not exists courses_banner_media_id_idx
      on courses (banner_media_id)
      where banner_media_id is not null
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop index if exists courses_banner_media_id_idx`.execute(database);
  await sql`alter table courses drop column if exists banner_media_id`.execute(
    database,
  );
}
