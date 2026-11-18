import { sql, type Kysely } from "kysely";

/**
 * Read receipts per chat, for admins and instructors: on or off in one
 * private chat or group, whatever their setting for all chats says. Null
 * follows that setting.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table chat_members add column if not exists read_receipts boolean
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table chat_members drop column if exists read_receipts
  `.execute(database);
}
