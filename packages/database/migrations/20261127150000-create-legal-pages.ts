import { sql, type Kysely } from "kysely";

/**
 * The legal and company pages (Terms, Privacy, Policies, …) as an
 * administrator rewrote them in Platform → Legal pages: one row per page,
 * its title, meta description, heading and effective-date line, and its
 * body as Markdown. A page without a row shows the text built into the web
 * app; deleting the row brings that text back.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    create table if not exists legal_pages (
      slug text primary key check (slug ~ '^[a-z][a-z-]{0,39}$'),
      title text not null,
      description text not null,
      heading text not null,
      effective text not null default '',
      markdown text not null,
      updated_by uuid references users(id) on delete set null,
      created_at timestamptz not null default current_timestamp,
      updated_at timestamptz not null default current_timestamp
    )
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop table if exists legal_pages`.execute(database);
}
