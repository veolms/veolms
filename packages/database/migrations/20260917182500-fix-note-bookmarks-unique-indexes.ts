import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    DROP INDEX IF EXISTS idx_learning_bookmarks_user_thread;
    DROP INDEX IF EXISTS idx_learning_bookmarks_user_note;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_learning_bookmarks_user_thread
      ON learning_bookmarks (user_id, thread_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_learning_bookmarks_user_note
      ON learning_bookmarks (user_id, note_id);
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    DROP INDEX IF EXISTS idx_learning_bookmarks_user_note;
    DROP INDEX IF EXISTS idx_learning_bookmarks_user_thread;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_learning_bookmarks_user_thread
      ON learning_bookmarks (user_id, thread_id)
      WHERE thread_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_learning_bookmarks_user_note
      ON learning_bookmarks (user_id, note_id)
      WHERE note_id IS NOT NULL;
  `.execute(database);
}
