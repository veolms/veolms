import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  // 1. Make thread_id nullable in learning_bookmarks
  await sql`
    ALTER TABLE learning_bookmarks ALTER COLUMN thread_id DROP NOT NULL;
  `.execute(database);

  // 2. Add note_id column to learning_bookmarks
  await sql`
    ALTER TABLE learning_bookmarks
    ADD COLUMN IF NOT EXISTS note_id UUID REFERENCES learning_notes(id) ON DELETE CASCADE;
  `.execute(database);

  // 3. Drop old unique index on (user_id, thread_id) if it exists, replace with unconditional unique indexes
  await sql`
    DROP INDEX IF EXISTS idx_learning_bookmarks_unique;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_learning_bookmarks_user_thread
      ON learning_bookmarks (user_id, thread_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_learning_bookmarks_user_note
      ON learning_bookmarks (user_id, note_id);
  `.execute(database);

  // 4. Add check constraint to ensure exactly one target is set
  await sql`
    ALTER TABLE learning_bookmarks DROP CONSTRAINT IF EXISTS chk_learning_bookmarks_target;
    ALTER TABLE learning_bookmarks ADD CONSTRAINT chk_learning_bookmarks_target
      CHECK (
        (thread_id IS NOT NULL AND note_id IS NULL) OR
        (thread_id IS NULL AND note_id IS NOT NULL)
      );
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    DELETE FROM learning_bookmarks WHERE note_id IS NOT NULL;
    ALTER TABLE learning_bookmarks DROP CONSTRAINT IF EXISTS chk_learning_bookmarks_target;
    DROP INDEX IF EXISTS idx_learning_bookmarks_user_note;
    DROP INDEX IF EXISTS idx_learning_bookmarks_user_thread;
    ALTER TABLE learning_bookmarks DROP COLUMN IF EXISTS note_id;
    ALTER TABLE learning_bookmarks ALTER COLUMN thread_id SET NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_learning_bookmarks_unique
      ON learning_bookmarks (user_id, thread_id);
  `.execute(database);
}
