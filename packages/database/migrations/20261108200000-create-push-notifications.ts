import { sql, type Kysely } from "kysely";

/**
 * Mobile push (Firebase Cloud Messaging).
 *
 * push_devices: one row per app install, keyed by its Firebase Installation
 * ID (FID). `application_id` is the Android package name or iOS bundle
 * identifier, which picks the Firebase project the message is sent with.
 * `session_id` is the login that last registered the install, so signing
 * that login out stops its pushes; when old sessions are purged the link is
 * cleared, not the device (a login that simply expired keeps its pushes).
 *
 * push_deliveries: the push queue for notifications and chat messages. One
 * row per message per user; `pending_device_ids` lists the installs still to
 * receive it once sending has started (null = not started: every install),
 * so a retry never repeats a phone that already got it. `expires_at` stops
 * a push that waited too long from arriving late.
 *
 * Preferences gain the `push` channel.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    create table if not exists push_devices (
      id uuid primary key,
      user_id uuid not null references users (id) on delete cascade,
      fid text not null,
      application_id text not null,
      platform text not null,
      app_version text,
      device_label text,
      session_id uuid references sessions (id) on delete set null,
      push_allowed boolean not null default true,
      failure_count integer not null default 0,
      last_error text,
      created_at timestamptz not null default current_timestamp,
      last_seen_at timestamptz not null default current_timestamp,
      last_success_at timestamptz,
      constraint push_devices_fid_unique unique (fid),
      constraint push_devices_platform_valid check (platform in ('android', 'ios')),
      constraint push_devices_fid_length check (char_length(fid) between 1 and 255),
      constraint push_devices_application_length check (
        char_length(application_id) between 1 and 255
      ),
      constraint push_devices_failures_valid check (failure_count >= 0)
    )
  `.execute(database);
  await sql`
    create index if not exists idx_push_devices_user on push_devices (user_id)
  `.execute(database);
  await sql`
    create index if not exists idx_push_devices_last_seen
      on push_devices (last_seen_at)
  `.execute(database);
  await sql`
    create index if not exists idx_push_devices_session
      on push_devices (session_id) where session_id is not null
  `.execute(database);

  await sql`
    create table if not exists push_deliveries (
      id uuid primary key,
      user_id uuid not null references users (id) on delete cascade,
      source text not null,
      notification_id uuid references notifications (id) on delete cascade,
      dedupe_key text not null,
      payload jsonb not null,
      status text not null default 'pending',
      pending_device_ids uuid[],
      attempt_count integer not null default 0,
      next_attempt_at timestamptz not null default current_timestamp,
      locked_until timestamptz,
      last_error text,
      sent_at timestamptz,
      expires_at timestamptz not null,
      created_at timestamptz not null default current_timestamp,
      updated_at timestamptz not null default current_timestamp,
      constraint push_deliveries_dedupe_unique unique (dedupe_key),
      constraint push_deliveries_source_valid check (source in ('notification', 'chat')),
      constraint push_deliveries_status_valid check (
        status in ('pending', 'processing', 'sent', 'failed', 'skipped')
      ),
      constraint push_deliveries_attempts_valid check (attempt_count >= 0)
    )
  `.execute(database);
  await sql`
    create index if not exists idx_push_deliveries_due
      on push_deliveries (next_attempt_at)
      where status in ('pending', 'processing')
  `.execute(database);
  await sql`
    create index if not exists idx_push_deliveries_created
      on push_deliveries (created_at)
  `.execute(database);

  await sql`
    alter table notification_deliveries
      drop constraint if exists notification_deliveries_channel_valid
  `.execute(database);
  await sql`
    alter table notification_deliveries
      add constraint notification_deliveries_channel_valid
        check (channel in ('in_app', 'email', 'push'))
  `.execute(database);
  await sql`
    alter table notification_preferences
      drop constraint if exists notification_preferences_channel_valid
  `.execute(database);
  await sql`
    alter table notification_preferences
      add constraint notification_preferences_channel_valid
        check (channel in ('in_app', 'email', 'push'))
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`delete from notification_preferences where channel = 'push'`.execute(
    database,
  );
  await sql`delete from notification_deliveries where channel = 'push'`.execute(
    database,
  );
  await sql`
    alter table notification_preferences
      drop constraint if exists notification_preferences_channel_valid
  `.execute(database);
  await sql`
    alter table notification_preferences
      add constraint notification_preferences_channel_valid
        check (channel in ('in_app', 'email'))
  `.execute(database);
  await sql`
    alter table notification_deliveries
      drop constraint if exists notification_deliveries_channel_valid
  `.execute(database);
  await sql`
    alter table notification_deliveries
      add constraint notification_deliveries_channel_valid
        check (channel in ('in_app', 'email'))
  `.execute(database);
  await sql`drop table if exists push_deliveries`.execute(database);
  await sql`drop table if exists push_devices`.execute(database);
}
