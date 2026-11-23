import { sql, type Kysely } from "kysely";

/**
 * Learners free their storage space by deleting files they sent (Chats >
 * Settings > Storage). A chat file deleted this way keeps its message, which
 * shows "This file was deleted" (its entry in the message's `attachments` is
 * marked `removed`); the upload gets `removed_at`, stops counting at once
 * (`message_deleted` is set with it, which `storage_chat_upload_bytes`
 * already reads), and the chat retention job removes the row and, unless a
 * forwarded copy still uses it, the stored file.
 *
 * Restoring a deleted message must not bring a removed file back into the
 * count, so the trigger that follows message deletion now leaves removed
 * uploads alone.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table chat_uploads add column if not exists removed_at timestamptz
  `.execute(database);
  // The retention job's "removed, waiting to be cleaned up" list.
  await sql`
    create index if not exists idx_chat_uploads_removed
      on chat_uploads (removed_at)
      where removed_at is not null
  `.execute(database);
  await sql`
    create or replace function chat_uploads_follow_message_deletion()
    returns trigger
    language plpgsql
    as $fn$
    begin
      update chat_uploads
        set message_deleted = (new.deleted_at is not null)
        where room_id = new.room_id and message_seq = new.seq
          and removed_at is null
          and message_deleted is distinct from (new.deleted_at is not null);
      return null;
    end;
    $fn$
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    create or replace function chat_uploads_follow_message_deletion()
    returns trigger
    language plpgsql
    as $fn$
    begin
      update chat_uploads
        set message_deleted = (new.deleted_at is not null)
        where room_id = new.room_id and message_seq = new.seq
          and message_deleted is distinct from (new.deleted_at is not null);
      return null;
    end;
    $fn$
  `.execute(database);
  await sql`drop index if exists idx_chat_uploads_removed`.execute(database);
  await sql`
    alter table chat_uploads drop column if exists removed_at
  `.execute(database);
}
