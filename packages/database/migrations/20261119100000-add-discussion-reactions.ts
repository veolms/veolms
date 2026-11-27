import { sql, type Kysely } from "kysely";

/**
 * Reactions on comments, replies, and notes:
 * Adds reaction_type to learning_likes with default 'like'.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE learning_likes
      ADD COLUMN IF NOT EXISTS reaction_type text NOT NULL DEFAULT 'like'
        CHECK (reaction_type IN ('like', 'celebrate', 'support', 'love', 'insightful', 'funny'));
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE learning_likes
      DROP COLUMN IF EXISTS reaction_type;
  `.execute(database);
}
