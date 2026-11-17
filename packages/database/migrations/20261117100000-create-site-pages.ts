import { sql, type Kysely } from "kysely";

/**
 * The website builder (creator-features/40-page-builder-and-themes-plan.md,
 * Phase 0).
 *
 * - `sites`: the one site's look (theme, colour mode), kept apart from
 *   every page's content so switching theme never loses words.
 * - `site_pages`: a page's address, kind and autosaved draft, plus the live
 *   page's HTML as rendered at publish time (served as a file; a host
 *   Worker and R2 can take over serving later).
 * - `site_page_versions`: the content frozen at each publish, never
 *   edited, so rollback is pointing `live_version_id` at an older one.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    create table if not exists sites (
      id boolean primary key default true check (id),
      look jsonb not null,
      updated_by uuid references users (id) on delete set null,
      created_at timestamptz not null default current_timestamp,
      updated_at timestamptz not null default current_timestamp
    )
  `.execute(database);

  await sql`
    create table if not exists site_pages (
      id uuid primary key default gen_random_uuid(),
      slug text not null,
      title text not null,
      type text not null check (type in ('home', 'landing', 'link_in_bio', 'blank')),
      draft jsonb not null,
      draft_updated_at timestamptz not null default current_timestamp,
      draft_is_live boolean not null default false,
      live_version_id uuid,
      live_html text,
      live_course_ids uuid[] not null default '{}',
      created_by uuid references users (id) on delete set null,
      created_at timestamptz not null default current_timestamp,
      updated_at timestamptz not null default current_timestamp,
      constraint site_pages_slug_key unique (slug)
    )
  `.execute(database);

  await sql`
    create table if not exists site_page_versions (
      id uuid primary key default gen_random_uuid(),
      page_id uuid not null references site_pages (id) on delete cascade,
      number integer not null check (number > 0),
      document jsonb not null,
      published_by uuid references users (id) on delete set null,
      published_at timestamptz not null default current_timestamp,
      constraint site_page_versions_page_number_key unique (page_id, number)
    )
  `.execute(database);

  await sql`
    alter table site_pages
      drop constraint if exists site_pages_live_version_fkey,
      add constraint site_pages_live_version_fkey
        foreign key (live_version_id) references site_page_versions (id)
        on delete set null
  `.execute(database);

  // Re-rendering the pages that show a course when it changes.
  await sql`
    create index if not exists site_pages_live_course_ids_idx
      on site_pages using gin (live_course_ids)
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`alter table if exists site_pages drop constraint if exists site_pages_live_version_fkey`.execute(
    database,
  );
  await sql`drop table if exists site_page_versions`.execute(database);
  await sql`drop table if exists site_pages`.execute(database);
  await sql`drop table if exists sites`.execute(database);
}
