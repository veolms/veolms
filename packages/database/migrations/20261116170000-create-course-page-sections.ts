import { sql, type Kysely } from "kysely";

/**
 * The course page's ready sections (creator-features/39-sales-page-sections-plan.md):
 * what you'll learn, who it's for, before you start, the instructor,
 * testimonials, FAQ, guarantee, plus the place of the built-in curriculum
 * and "about" sections, and the page's own search title and description
 * (kind "seo", never shown as a section).
 *
 * One row per kind per course. `content` is checked by the contracts'
 * schema for its kind on the way in; `position` orders the visible
 * sections; `is_visible` keeps a switched-off section's words.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    create table if not exists course_page_sections (
      id uuid primary key default gen_random_uuid(),
      course_id uuid not null references courses (id) on delete cascade,
      kind text not null check (
        kind in (
          'outcomes', 'audience', 'requirements', 'instructor',
          'testimonials', 'faq', 'guarantee', 'curriculum', 'about', 'seo'
        )
      ),
      position integer not null default 0,
      is_visible boolean not null default true,
      content jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default current_timestamp,
      updated_at timestamptz not null default current_timestamp,
      constraint course_page_sections_course_kind_key unique (course_id, kind)
    )
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop table if exists course_page_sections`.execute(database);
}
