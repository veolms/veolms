import { sql, type Kysely } from "kysely";

/**
 * Part of a course, sold on its own.
 *
 * - `courses.unlisted`: a course kept off every list (the catalogue, the
 *   home rows, the prerendered pages, the admin's course list, My Courses).
 *   It is bought from its own link and exists for its purchase records and
 *   invoices; what the buyer gets is the course (or the part of a course)
 *   it links. Managed from the course it unlocks ("Partial access").
 * - `course_links.section_ids`: the sections of the linked course the link
 *   opens. Null opens the whole course, as every link did before.
 * - `access_grants.section_ids`: on a `linked_course` grant, the sections
 *   the learner's links open between them, worked out by the link sync.
 *   Null opens every section. Only read on a `linked_course` grant: a
 *   purchase or a manual grant written over such a row always opens the
 *   whole course, whatever is left in the column.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table courses
      add column if not exists unlisted boolean not null default false
  `.execute(database);

  await sql`
    alter table course_links
      add column if not exists section_ids uuid[]
  `.execute(database);
  await sql`
    alter table course_links
      drop constraint if exists course_links_section_ids_not_empty
  `.execute(database);
  await sql`
    alter table course_links
      add constraint course_links_section_ids_not_empty
      check (section_ids is null or cardinality(section_ids) > 0)
  `.execute(database);

  await sql`
    alter table access_grants
      add column if not exists section_ids uuid[]
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  // A part-of-a-course link becomes a whole-course one, so nobody who held
  // part of a course loses it; their grants open everything until the next
  // sync, as every link did before.
  await sql`
    alter table access_grants drop column if exists section_ids
  `.execute(database);
  await sql`
    alter table course_links
      drop constraint if exists course_links_section_ids_not_empty
  `.execute(database);
  await sql`
    alter table course_links drop column if exists section_ids
  `.execute(database);
  await sql`
    alter table courses drop column if exists unlisted
  `.execute(database);
}
