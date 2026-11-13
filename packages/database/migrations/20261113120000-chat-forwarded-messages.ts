import { sql, type Kysely } from "kysely";

/**
 * Forwarded messages (WhatsApp's "Forwarded" label). A forwarded file is a
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
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop index if exists chat_uploads_storage_key_idx`.execute(
    database,
  );
  await sql`
    alter table chat_messages drop column if exists forwarded
  `.execute(database);
}
