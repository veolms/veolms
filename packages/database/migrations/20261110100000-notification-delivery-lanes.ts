import { sql, type Kysely } from "kysely";

/**
 * Two lanes for queued emails, and a list of addresses never to mail again.
 *
 * Every email used to wait in one queue, oldest first. A course-wide notice
 * to thousands of learners therefore held every sign-in receipt and reply
 * email behind it, and when the mail provider throttled the burst, the
 * retries re-entered the same queue ahead of everything newer. Mail that one
 * person caused (a purchase, a reply to them) is now `transactional` and is
 * always sent first; mail that goes to everyone (a course published, a quiz
 * assigned, daily reminders) is `bulk` and is sent a few at a time behind it.
 *
 * `email_suppressions` keeps addresses the provider said do not exist (or
 * whose owners complained), so no later email is even queued for them.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table notification_deliveries
      add column if not exists lane text not null default 'transactional'
  `.execute(database);
  await sql`
    alter table notification_deliveries
      drop constraint if exists notification_deliveries_lane_valid
  `.execute(database);
  await sql`
    alter table notification_deliveries
      add constraint notification_deliveries_lane_valid
      check (lane in ('transactional', 'bulk'))
  `.execute(database);
  // The claim query reads one lane at a time, due rows first.
  await sql`
    create index if not exists idx_notification_deliveries_email_lane_due
      on notification_deliveries (lane, status, next_attempt_at)
      where channel = 'email'
  `.execute(database);

  await sql`
    create table if not exists email_suppressions (
      email text primary key,
      reason text not null,
      source text not null,
      detail text,
      created_at timestamptz not null default current_timestamp,
      constraint email_suppressions_reason_valid
        check (reason in ('hard_bounce', 'complaint', 'manual'))
    )
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop table if exists email_suppressions`.execute(database);
  await sql`
    drop index if exists idx_notification_deliveries_email_lane_due
  `.execute(database);
  await sql`
    alter table notification_deliveries
      drop constraint if exists notification_deliveries_lane_valid
  `.execute(database);
  await sql`
    alter table notification_deliveries drop column if exists lane
  `.execute(database);
}
