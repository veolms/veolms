import { sql, type Kysely } from "kysely";

/**
 * Admins can put the courses in an order of their own. A course's place is
 * `sort_position` (0 first); a course with none has not been placed and is
 * listed after the placed ones, in the order each list already used.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table courses
      add column if not exists sort_position integer
  `.execute(database);
  await sql`
    alter table courses
      drop constraint if exists courses_sort_position_nonnegative
  `.execute(database);
  await sql`
    alter table courses
      add constraint courses_sort_position_nonnegative
      check (sort_position is null or sort_position >= 0)
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table courses
      drop constraint if exists courses_sort_position_nonnegative
  `.execute(database);
  await sql`
    alter table courses drop column if exists sort_position
  `.execute(database);
}
