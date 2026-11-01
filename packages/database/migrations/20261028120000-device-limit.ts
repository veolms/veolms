import { sql, type Kysely } from "kysely";

/**
 * A student signed in on as many devices as the academy allows
 * (Platform > Security) is asked to sign one out before a new one is let
 * in.
 *
 * - Each session keeps roughly where it was signed in from (city, region,
 *   country, from the location headers Cloudflare adds to a request), so
 *   the student can tell their devices apart. Added empty and nullable: no
 *   rewrite, and sessions from before show no location.
 * - A sign-in waiting for that choice is kept in `pending_device_sign_ins`:
 *   who it is for, where it came from, and a secret held in the waiting
 *   browser's cookie (stored hashed). It lasts minutes and is used once.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table sessions
      add column if not exists location_city text,
      add column if not exists location_region text,
      add column if not exists location_country text
  `.execute(database);

  await sql`
    create table if not exists pending_device_sign_ins (
      id uuid primary key,
      user_id uuid not null references users(id) on delete cascade,
      token_hash text not null unique,
      ip_address text,
      user_agent text,
      location_city text,
      location_region text,
      location_country text,
      expires_at timestamptz not null,
      used_at timestamptz,
      created_at timestamptz not null default now()
    )
  `.execute(database);
  await sql`
    create index if not exists pending_device_sign_ins_expires_at_idx
      on pending_device_sign_ins (expires_at)
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop table if exists pending_device_sign_ins`.execute(database);
  await sql`
    alter table sessions
      drop column if exists location_city,
      drop column if exists location_region,
      drop column if exists location_country
  `.execute(database);
}
