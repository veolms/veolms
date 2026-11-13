import { sql, type Kysely } from "kysely";

/**
 * Forwarded messages (WhatsApp's "Forwarded" label), and an index for the
 * chat list's newest reaction ("Reacted 👍 to: …"). A forwarded file is a
 * new upload row pointing at the same stored object, so the file cleanup
 * only deletes an object once no row uses it.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table chat_messages
      add column if not exists forwarded boolean not null default false
  `.execute(database);
  await sql`
    create index if not exists chat_uploads_storage_key_idx
      on chat_uploads (storage_key)
  `.execute(database);
  // The chat list's "Reacted 👍 to: …": a chat's newest reaction.
  await sql`
    create index if not exists chat_reactions_room_recent_idx
      on chat_reactions (room_id, created_at desc)
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop index if exists chat_reactions_room_recent_idx`.execute(
    database,
  );
  await sql`drop index if exists chat_uploads_storage_key_idx`.execute(
    database,
  );
  await sql`
    alter table chat_messages drop column if exists forwarded
  `.execute(database);
}
