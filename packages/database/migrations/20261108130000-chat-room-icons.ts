import { sql, type Kysely } from "kysely";

/**
 * A group's icon: a photo an admin uploaded (a chat upload of this group).
 * Without one a course group shows its course's picture.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table chat_rooms
      add column if not exists icon_upload_id uuid
        references chat_uploads (id) on delete set null
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`alter table chat_rooms drop column if exists icon_upload_id`.execute(
    database,
  );
}
