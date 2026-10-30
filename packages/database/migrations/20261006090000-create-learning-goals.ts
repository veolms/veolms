import { sql, type Kysely } from "kysely";

/**
 * Dynamic learning goals & streaks (approved PRD, 2026-10).
 *
 * - user_learning_settings: one row per user (carts pattern). NULL
 *   daily_goal_minutes = "no goal configured" — the home widget shows the
 *   empty state. time_zone is an IANA id validated at the API layer; it
 *   buckets daily activity into the learner's local calendar days.
 * - learning_daily_activity: the per-day ledger the streak and today's
 *   progress derive from. Written in the same transaction as the existing
 *   progress upsert (seconds = progress delta x lesson duration), so
 *   replays/retries are idempotent by construction. Streaks are computed
 *   on read — nothing here is denormalized or needs backfill jobs.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    create table if not exists user_learning_settings (
      user_id uuid primary key references users(id) on delete cascade,
      daily_goal_minutes integer
        check (daily_goal_minutes is null
               or (daily_goal_minutes >= 15 and daily_goal_minutes <= 720)),
      reminders_enabled boolean not null default false,
      reminder_days text[] not null default '{mon,tue,wed,thu,fri}',
      reminder_time time not null default '19:00',
      time_zone text not null default 'UTC',
      created_at timestamptz not null default current_timestamp,
      updated_at timestamptz not null default current_timestamp
    )
  `.execute(database);

  // The reminder tick scans only opted-in users.
  await sql`
    create index if not exists idx_user_learning_settings_reminders
      on user_learning_settings (reminder_time)
      where reminders_enabled
  `.execute(database);

  await sql`
    create table if not exists learning_daily_activity (
      user_id uuid not null references users(id) on delete cascade,
      activity_date date not null,
      seconds integer not null default 0,
      completions integer not null default 0,
      primary key (user_id, activity_date)
    )
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop table if exists learning_daily_activity`.execute(database);
  await sql`drop index if exists idx_user_learning_settings_reminders`.execute(
    database,
  );
  await sql`drop table if exists user_learning_settings`.execute(database);
}
