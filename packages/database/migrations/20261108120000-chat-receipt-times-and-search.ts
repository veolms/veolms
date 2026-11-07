import { sql, type Kysely } from "kysely";

/**
 * Message info's times and searching a chat's messages.
 *
 * - `chat_receipt_marks`: each time a member's received / read position
 *   moved (written with the batched position update, about once a second
 *   at most per member). Message info's "Read 10:42" is the first mark at
 *   or past the message. Private chats and groups up to 1,024 members only;
 *   kept 30 days (the retention job removes older marks).
 * - A trigram index on message text, so "search in this chat" finds words
 *   anywhere in a message without reading the whole chat.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`create extension if not exists pg_trgm`.execute(database);
  await sql`
    create table if not exists chat_receipt_marks (
      room_id uuid not null references chat_rooms (id) on delete cascade,
      user_id uuid not null references users (id) on delete cascade,
      read_seq bigint not null,
      delivered_seq bigint not null,
      at timestamptz not null default current_timestamp
    )
  `.execute(database);
  await sql`
    create index if not exists idx_chat_receipt_marks_member
      on chat_receipt_marks (room_id, user_id, at)
  `.execute(database);
  await sql`
    create index if not exists idx_chat_receipt_marks_at
      on chat_receipt_marks (at)
  `.execute(database);
  await sql`
    create index if not exists idx_chat_messages_body_trgm
      on chat_messages using gin (body gin_trgm_ops)
      where deleted_at is null
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop index if exists idx_chat_messages_body_trgm`.execute(database);
  await sql`drop table if exists chat_receipt_marks`.execute(database);
}
