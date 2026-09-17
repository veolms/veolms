import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  // 1. Ensure visibility column exists on learning_notes
  await sql`
    ALTER TABLE learning_notes
    ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('public', 'unlisted', 'private'));
  `.execute(database);

  // 2. Ensure likes_count column exists on learning_notes
  await sql`
    ALTER TABLE learning_notes
    ADD COLUMN IF NOT EXISTS likes_count INTEGER NOT NULL DEFAULT 0
    CHECK (likes_count >= 0);
  `.execute(database);

  // 3. Ensure tags column exists on learning_notes
  await sql`
    ALTER TABLE learning_notes
    ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT ARRAY[]::text[];
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE learning_notes DROP COLUMN IF EXISTS visibility;
  `.execute(database);
}
