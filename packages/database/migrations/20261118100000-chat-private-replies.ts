import { sql, type Kysely } from "kysely";

/**
 * WhatsApp's "Reply privately": a reply in a private chat that quotes a
 * message from a group. `reply_to_seq` then numbers a message of the group
 * named here, not of the message's own chat.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table chat_messages
      add column if not exists reply_to_room_id uuid
        references chat_rooms (id) on delete set null
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table chat_messages drop column if exists reply_to_room_id
  `.execute(database);
}
