import { sql, type Kysely } from "kysely";

/**
 * Web push (browsers, VAPID) next to mobile push.
 *
 * A browser's push subscription is one more `push_devices` row, with
 * platform 'web', so it shares the push queue (push_deliveries), its
 * retries, per-install progress and clean-up with the phones. `fid` holds
 * "web:" + the SHA-256 of the endpoint (endpoints can be long), which keeps
 * one row per browser; the endpoint and its two keys sit in their own
 * columns, present exactly when the row is a browser.
 *
 * chat_members.muted_until: a chat muted for a while (8 hours, a week).
 * Muted for good stays notify_level 'none'.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table push_devices
      add column if not exists web_endpoint text,
      add column if not exists web_p256dh text,
      add column if not exists web_auth text
  `.execute(database);
  await sql`
    alter table push_devices
      drop constraint if exists push_devices_platform_valid
  `.execute(database);
  await sql`
    alter table push_devices
      add constraint push_devices_platform_valid
        check (platform in ('android', 'ios', 'web'))
  `.execute(database);
  await sql`
    alter table push_devices
      add constraint push_devices_web_subscription check (
        (platform = 'web') = (
          web_endpoint is not null
          and web_p256dh is not null
          and web_auth is not null
        )
        and (web_endpoint is null or char_length(web_endpoint) <= 2048)
        and (web_p256dh is null or char_length(web_p256dh) <= 200)
        and (web_auth is null or char_length(web_auth) <= 100)
      )
  `.execute(database);

  await sql`
    alter table chat_members add column if not exists muted_until timestamptz
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`alter table chat_members drop column if exists muted_until`.execute(
    database,
  );
  await sql`delete from push_devices where platform = 'web'`.execute(database);
  await sql`
    alter table push_devices
      drop constraint if exists push_devices_web_subscription
  `.execute(database);
  await sql`
    alter table push_devices
      drop constraint if exists push_devices_platform_valid
  `.execute(database);
  await sql`
    alter table push_devices
      add constraint push_devices_platform_valid
        check (platform in ('android', 'ios'))
  `.execute(database);
  await sql`
    alter table push_devices
      drop column if exists web_endpoint,
      drop column if exists web_p256dh,
      drop column if exists web_auth
  `.execute(database);
}
