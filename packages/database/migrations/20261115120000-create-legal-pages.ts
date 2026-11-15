import { sql, type Kysely } from "kysely";

/**
 * The legal and company pages an administrator has rewritten (Platform >
 * Legal pages). A page with no row shows its default template; deleting the
 * row restores it. The words keep their `{{placeholders}}`, filled from the
 * academy's details when the page is read.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    create table if not exists legal_pages (
      slug text primary key check (slug in (
        'terms', 'privacy', 'policies', 'community-guidelines',
        'about', 'contact', 'delete-account'
      )),
      title text not null,
      description text not null default '',
      heading text not null,
      effective text,
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
