import { sql, type Kysely } from "kysely";

/**
 * A course's own line under its title on the certificate ("270+ hours of
 * comprehensive backend engineering coursework."). Without one, the
 * certificate writes a line from the course's length.
 *
 * The row now holds two optional course settings, so the completion share
 * becomes optional too: no share means the academy's (as having no row did).
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table course_certificate_settings
      alter column threshold_percent drop not null,
      alter column threshold_percent drop default,
      add column if not exists course_note text
        check (course_note is null or char_length(course_note) between 1 and 160)
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    delete from course_certificate_settings where threshold_percent is null
  `.execute(database);
  await sql`
    alter table course_certificate_settings
      drop column if exists course_note,
      alter column threshold_percent set default 90,
      alter column threshold_percent set not null
  `.execute(database);
}
