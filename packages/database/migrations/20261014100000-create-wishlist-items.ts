import { sql, type Kysely } from "kysely";

/**
 * The courses a learner has saved for later.
 *
 * The wishlist was kept in the browser only, so it did not follow a learner
 * to another device and was lost with the browser's data. One row per
 * learner and course; saving the same course twice is the same row.
 *
 * A row goes with its learner and with its course, as their other per-course
 * rows do. A course that is unpublished or in the bin keeps its rows: the API
 * leaves it out of the list, and it is back when the course is.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    create table if not exists wishlist_items (
      user_id uuid not null references users(id) on delete cascade,
      course_id uuid not null references courses(id) on delete cascade,
      created_at timestamptz not null default current_timestamp,
      primary key (user_id, course_id)
    )
  `.execute(database);

  // Removing a course removes its rows here; without this that is a scan
  // of every learner's wishlist.
  await sql`
    create index if not exists idx_wishlist_items_course
      on wishlist_items (course_id)
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop table if exists wishlist_items`.execute(database);
}
