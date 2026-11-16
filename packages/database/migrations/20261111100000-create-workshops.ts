import { sql, type Kysely } from "kysely";

/**
 * Workshops: live sessions run on Zoom, Google Meet, YouTube Live or any
 * link the host pastes, with the platform owning the page, registration,
 * reminders, the join button and the recording.
 *
 * - `workshops`: one row per workshop (price, course link, cover and
 *   resources are columns, not tables).
 * - `workshop_sessions`: its one or more sessions, each with the meeting
 *   link encrypted at rest.
 * - `workshop_registrations`: who registered, how, and which sessions they
 *   joined.
 *
 * Also adds `workshop.read` and `workshop.manage` (positions 85 and 86 in
 * the contracts list, the seed's id scheme), granted to admin and
 * instructor so an instructor can run their own sessions.
 */
const workshopPermissions = [
  { key: "workshop.read", id: "00000000-0000-4000-b000-000000000085" },
  { key: "workshop.manage", id: "00000000-0000-4000-b000-000000000086" },
] as const;

export async function up(database: Kysely<unknown>): Promise<void> {
  for (const permission of workshopPermissions) {
    // The fixed id is the seed's for a fresh database. A database seeded
    // from an older list may already use that id for another key; the key
    // then gets a random id, which is fine: every lookup is by key.
    await sql`
      insert into permissions (id, permission_key, domain, description)
      select
        case
          when exists (
            select 1 from permissions where id = ${permission.id}::uuid
          )
            then gen_random_uuid()
          else ${permission.id}::uuid
        end,
        ${permission.key},
        'workshop',
        ${`Permission to perform ${permission.key}`}
      where not exists (
        select 1 from permissions where permission_key = ${permission.key}
      )
    `.execute(database);
    await sql`
      insert into role_permissions (role_id, permission_id, effect)
      select roles.id, permissions.id, 'allow'
      from roles
      join permissions on permissions.permission_key = ${permission.key}
      where roles.name in ('admin', 'instructor')
      on conflict (role_id, permission_id) do update set effect = 'allow'
    `.execute(database);
  }

  await sql`
    create table if not exists workshops (
      id uuid primary key,
      slug text not null unique,
      title text not null,
      summary text,
      description text,
      cover_media_id uuid references media_assets (id) on delete set null,
      cover_url text,
      host_user_id uuid not null references users (id),
      status text not null default 'draft',
      course_id uuid references courses (id) on delete set null,
      price_minor integer,
      currency text not null default 'INR',
      capacity integer,
      resources jsonb not null default '[]'::jsonb,
      cancel_reason text,
      created_by uuid not null references users (id),
      published_at timestamptz,
      cancelled_at timestamptz,
      created_at timestamptz not null default current_timestamp,
      updated_at timestamptz not null default current_timestamp,
      deleted_at timestamptz,
      constraint workshops_status_valid
        check (status in ('draft', 'published', 'cancelled')),
      constraint workshops_price_nonnegative
        check (price_minor is null or price_minor >= 0),
      constraint workshops_capacity_positive
        check (capacity is null or capacity > 0)
    )
  `.execute(database);
  await sql`
    create index if not exists idx_workshops_status
      on workshops (status, deleted_at, updated_at desc)
  `.execute(database);

  await sql`
    create table if not exists workshop_sessions (
      id uuid primary key,
      workshop_id uuid not null references workshops (id) on delete cascade,
      position integer not null default 0,
      title text,
      starts_at timestamptz not null,
      ends_at timestamptz not null,
      time_zone text not null,
      join_url_encrypted text,
      passcode text,
      recording_media_id uuid references media_assets (id) on delete set null,
      recording_ready_at timestamptz,
      created_at timestamptz not null default current_timestamp,
      updated_at timestamptz not null default current_timestamp,
      constraint workshop_sessions_ends_after_start check (ends_at > starts_at)
    )
  `.execute(database);
  await sql`
    create index if not exists idx_workshop_sessions_workshop
      on workshop_sessions (workshop_id, position)
  `.execute(database);
  // The reminder poller and the "upcoming" tab read by start time.
  await sql`
    create index if not exists idx_workshop_sessions_starts
      on workshop_sessions (starts_at)
  `.execute(database);

  await sql`
    create table if not exists workshop_registrations (
      id uuid primary key,
      workshop_id uuid not null references workshops (id) on delete cascade,
      user_id uuid not null references users (id) on delete cascade,
      source text not null,
      order_id uuid references orders (id) on delete set null,
      registered_at timestamptz not null default current_timestamp,
      cancelled_at timestamptz,
      joined_session_ids uuid[] not null default '{}',
      constraint workshop_registrations_source_valid
        check (source in ('free', 'order', 'admin')),
      constraint workshop_registrations_unique unique (workshop_id, user_id)
    )
  `.execute(database);
  await sql`
    create index if not exists idx_workshop_registrations_user
      on workshop_registrations (user_id, registered_at desc)
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop table if exists workshop_registrations`.execute(database);
  await sql`drop table if exists workshop_sessions`.execute(database);
  await sql`drop table if exists workshops`.execute(database);
  for (const permission of workshopPermissions) {
    await sql`
      delete from role_permissions
      where permission_id in (
        select id from permissions where permission_key = ${permission.key}
      )
    `.execute(database);
    await sql`
      delete from permissions where permission_key = ${permission.key}
    `.execute(database);
  }
}
