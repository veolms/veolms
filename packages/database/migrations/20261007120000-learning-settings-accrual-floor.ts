import { sql, type Kysely } from "kysely";

/**
 * Learning-day integrity for time zone changes.
 *
 * 1. `accrual_floor_date`: the learner's local date at the moment they last
 *    changed time zone. Activity is never credited to a day before it, so
 *    switching to a zone that is still on "yesterday" can no longer fill in
 *    a missed day (a two-day streak in two minutes).
 *
 * 2. Stored zones Postgres does not recognise are reset to UTC. The API
 *    used to validate zones with JavaScript's `Intl` only, which accepts
 *    ids Postgres rejects ("CTT"); one such row made every progress save
 *    for that learner fail and aborted the reminder scan for everyone.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table user_learning_settings
      add column if not exists accrual_floor_date date
  `.execute(database);

  await sql`
    update user_learning_settings
    set time_zone = 'UTC', updated_at = now()
    where time_zone not in (select name from pg_timezone_names)
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table user_learning_settings
      drop column if exists accrual_floor_date
  `.execute(database);
}
