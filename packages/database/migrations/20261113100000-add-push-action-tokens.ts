import { sql, type Kysely } from "kysely";

/**
 * Push action tokens: "Reply" and "Mark as read" from a chat notification
 * on the phone, done by the app's native code, which never has the user's
 * session (docs/mobile-push.md, "Reply from a notification").
 *
 * Each chat push to a phone carries one random, single-use token, bound to
 * the user, that phone (push device), its login (session) and one chat. The
 * server keeps only its SHA-256 (hex). It allows a text reply or marking the chat
 * read up to `seq`, until it expires, is used, is replaced by a newer push,
 * or the chat is read up to `stale_from_seq` anywhere. A row also records
 * that the phone may be showing that chat's notification: when the chat is
 * read elsewhere, those phones get a silent "chat read" push.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    create table if not exists push_action_tokens (
      id uuid primary key default gen_random_uuid(),
      token_hash text not null unique,
      user_id uuid not null references users(id) on delete cascade,
      push_device_id uuid not null references push_devices(id) on delete cascade,
      session_id uuid not null references sessions(id) on delete cascade,
      room_id uuid not null references chat_rooms(id) on delete cascade,
      seq bigint not null,
      stale_from_seq bigint not null,
      scopes text[] not null,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null,
      used_at timestamptz,
      used_client_id uuid,
      revoked_at timestamptz,
      revoked_reason text,
      constraint push_action_tokens_scopes_valid
        check (scopes <@ array['chat.reply', 'chat.read']::text[]),
      constraint push_action_tokens_revoked_reason_valid
        check (revoked_reason is null or revoked_reason in
          ('superseded', 'read', 'rotated'))
    )
  `.execute(database);
  await sql`
    create index if not exists push_action_tokens_device_room_active
      on push_action_tokens (push_device_id, room_id)
      where used_at is null and revoked_at is null
  `.execute(database);
  await sql`
    create index if not exists push_action_tokens_user_room_active
      on push_action_tokens (user_id, room_id)
      where used_at is null and revoked_at is null
  `.execute(database);
  await sql`
    create index if not exists push_action_tokens_expires_at
      on push_action_tokens (expires_at)
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop table if exists push_action_tokens`.execute(database);
}
