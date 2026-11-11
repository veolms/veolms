import { sql, type Kysely } from "kysely";

/**
 * A student brought over from the old platform joined there, long before
 * their account was made here: `users.joined_at` keeps that date. Null for
 * everyone who signed up here; their joined date is `created_at`.
 *
 * The Students list sorts "recent" by the joined date, so its index covers
 * `coalesce(joined_at, created_at)` as the old one covered `created_at`.
 * The dates are filled in by the migration project's backfill script.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table users add column if not exists joined_at timestamptz
  `.execute(database);
  await sql`
    create index if not exists idx_students_users_joined
      on users ((coalesce(joined_at, created_at)) desc, id desc)
      where is_deleted = false
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop index if exists idx_students_users_joined`.execute(database);
  await sql`alter table users drop column if exists joined_at`.execute(
    database,
  );
}
