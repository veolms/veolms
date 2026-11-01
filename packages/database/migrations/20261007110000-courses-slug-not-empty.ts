import { sql, type Kysely } from "kysely";

/**
 * A course slug must not be empty.
 *
 * Titles with no Latin letters or digits (Hindi, Chinese, emoji-only) used
 * to slugify to "" — and one published course with an empty slug makes the
 * public catalogue fail its response schema, so every page containing it
 * returned 500 and the static web build failed. The API now falls back to a
 * generated slug; this repairs any existing row and stops it recurring.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  // The slug is unique, so at most one row can hold "".
  await sql`
    update courses
    set slug = 'course-' || substr(replace(id::text, '-', ''), 1, 8)
    where slug = ''
  `.execute(database);

  await sql`
    alter table courses
      drop constraint if exists courses_slug_not_empty
  `.execute(database);
  await sql`
    alter table courses
      add constraint courses_slug_not_empty check (slug <> '')
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table courses
      drop constraint if exists courses_slug_not_empty
  `.execute(database);
}
