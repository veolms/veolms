import { sql, type Kysely } from "kysely";

/**
 * A link may send visitors to a page of this site, stored as its path
 * (`/courses/<slug>/overview`): old TagMango checkout addresses sent to our
 * course pages (24 Nov 2026). The destination check took https addresses
 * only; it now also takes a path with one leading slash (never `//`, which a
 * browser reads as another host). The API checks that the path is one of the
 * app's own pages.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table short_links
      drop constraint if exists short_links_destination_check,
      add constraint short_links_destination_check check (
        destination like 'https://%'
        or (destination like '/%' and destination not like '//%')
      )
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  // Links to pages of this site would break the old rule: removed first.
  await sql`delete from short_links where destination not like 'https://%'`.execute(
    database,
  );
  await sql`
    alter table short_links
      drop constraint if exists short_links_destination_check,
      add constraint short_links_destination_check check (
        destination like 'https://%'
      )
  `.execute(database);
}
