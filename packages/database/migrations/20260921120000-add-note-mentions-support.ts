import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE learning_mentions
      DROP CONSTRAINT IF EXISTS learning_mentions_source_type_check;
    ALTER TABLE learning_mentions
      ADD CONSTRAINT learning_mentions_source_type_check
      CHECK (source_type IN ('thread', 'reply', 'note'));
  `.execute(database);

  await sql`
    CREATE INDEX IF NOT EXISTS idx_learning_mentions_recipient_created
      ON learning_mentions (mentioned_user_id, created_at DESC, id DESC);
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    DELETE FROM learning_mentions WHERE source_type = 'note';
    ALTER TABLE learning_mentions
      DROP CONSTRAINT IF EXISTS learning_mentions_source_type_check;
    ALTER TABLE learning_mentions
      ADD CONSTRAINT learning_mentions_source_type_check
      CHECK (source_type IN ('thread', 'reply'));
    DROP INDEX IF EXISTS idx_learning_mentions_recipient_created;
  `.execute(database);
}
