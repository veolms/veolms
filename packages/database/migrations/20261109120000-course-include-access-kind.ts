import { sql, type Kysely } from "kysely";

/**
 * A "This course includes" line can be the line about how long the course
 * stays with a learner (`kind` 'access'): its title is written from the
 * course's access rule, so it can no longer say "3 years" for a course
 * whose access lasts 2.
 *
 * Every course was seeded with such a line typed out ("3 years of access",
 * see 20261029130000-course-include-details), and admins changed the number
 * by hand. In each course the first line worded that way becomes the access
 * line; its note, icon and colour stay. Lines worded otherwise stay custom.
 */
const ACCESS_WORDING = String.raw`^\s*(lifetime|\d+\s*(year|month|week|day)s?)\s+(of\s+)?access\s*$`;

export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table course_includes
      drop constraint if exists course_includes_kind_valid
  `.execute(database);
  await sql`
    alter table course_includes
      add constraint course_includes_kind_valid
      check (kind in ('custom', 'video', 'access'))
  `.execute(database);
  await sql`
    update course_includes as line
      set kind = 'access', updated_at = current_timestamp
      from (
        select distinct on (course_id) id
          from course_includes
          where kind = 'custom' and text ~* ${ACCESS_WORDING}
          order by course_id, position
      ) as first_access
      where line.id = first_access.id
        and not exists (
          select 1 from course_includes as other
            where other.course_id = line.course_id and other.kind = 'access'
        )
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    update course_includes
      set kind = 'custom', updated_at = current_timestamp
      where kind = 'access'
  `.execute(database);
  await sql`
    alter table course_includes
      drop constraint if exists course_includes_kind_valid
  `.execute(database);
  await sql`
    alter table course_includes
      add constraint course_includes_kind_valid
      check (kind in ('custom', 'video'))
  `.execute(database);
}
