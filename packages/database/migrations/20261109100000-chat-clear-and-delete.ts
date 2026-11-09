import { sql, type Kysely } from "kysely";

/**
 * "Clear chat" and "Delete chat", for one person (as in WhatsApp):
 * `cleared_seq` hides every message up to it from that member, and
 * `deleted_at` also takes the chat out of their list until a newer message
 * arrives.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table chat_members
      add column if not exists cleared_seq bigint not null default 0,
      add column if not exists deleted_at timestamptz
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table chat_members
      drop column if exists deleted_at,
      drop column if exists cleared_seq
  `.execute(database);
}
