import { sql, type Kysely } from "kysely";

/**
 * Chat presence and each person's chat privacy (WhatsApp's "Last seen and
 * online" and "Read receipts"), one row per person who has used chat.
 *
 * - `online_until`: pushed forward while the person has Chats open (one
 *   batched UPDATE per API process a minute); "online" is now < online_until.
 * - `last_seen_at`: when their last chat tab closed.
 * - `show_presence` off: nobody sees their online or last seen, and they see
 *   nobody's (reciprocal, as in WhatsApp).
 * - `read_receipts` off: private chats show nobody blue ticks either way
 *   (reciprocal). Groups always show them, as in WhatsApp.
 * - `enter_to_send`: the composer's Enter key (on by default).
 *
 * None of the columns is indexed besides the key, so every update is HOT.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    create table if not exists chat_profiles (
      user_id uuid primary key references users (id) on delete cascade,
      show_presence boolean not null default true,
      read_receipts boolean not null default true,
      enter_to_send boolean not null default true,
      online_until timestamptz,
      last_seen_at timestamptz,
      updated_at timestamptz not null default current_timestamp
    ) with (fillfactor = 80)
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop table if exists chat_profiles`.execute(database);
}
