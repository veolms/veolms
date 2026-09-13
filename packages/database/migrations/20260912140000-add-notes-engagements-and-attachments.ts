import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  // 1. Add likes_count column to learning_notes
  await sql`
    ALTER TABLE learning_notes
    ADD COLUMN IF NOT EXISTS likes_count INTEGER NOT NULL DEFAULT 0 CHECK (likes_count >= 0);
  `.execute(database);

  // 2. Update learning_likes target_type check constraint to include 'note'
  await sql`
    ALTER TABLE learning_likes DROP CONSTRAINT IF EXISTS learning_likes_target_type_check;
    ALTER TABLE learning_likes ADD CONSTRAINT learning_likes_target_type_check
      CHECK (target_type IN ('thread', 'reply', 'note'));
  `.execute(database);

  // 3. Update learning_attachments target_type check constraint to include 'note'
  await sql`
    ALTER TABLE learning_attachments DROP CONSTRAINT IF EXISTS learning_attachments_target_type_check;
    ALTER TABLE learning_attachments ADD CONSTRAINT learning_attachments_target_type_check
      CHECK (target_type IS NULL OR target_type IN ('thread', 'reply', 'note'));
  `.execute(database);

  // 4. Update learning_reports target_type check constraint to include 'note'
  await sql`
    ALTER TABLE learning_reports DROP CONSTRAINT IF EXISTS learning_reports_target_type_check;
    ALTER TABLE learning_reports ADD CONSTRAINT learning_reports_target_type_check
      CHECK (target_type IN ('thread', 'reply', 'note'));
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE learning_notes DROP COLUMN IF EXISTS likes_count;
  `.execute(database);

  await sql`
    DELETE FROM learning_likes WHERE target_type = 'note';
    ALTER TABLE learning_likes DROP CONSTRAINT IF EXISTS learning_likes_target_type_check;
    ALTER TABLE learning_likes ADD CONSTRAINT learning_likes_target_type_check
      CHECK (target_type IN ('thread', 'reply'));
  `.execute(database);

  await sql`
    DELETE FROM learning_attachments WHERE target_type = 'note';
    ALTER TABLE learning_attachments DROP CONSTRAINT IF EXISTS learning_attachments_target_type_check;
    ALTER TABLE learning_attachments ADD CONSTRAINT learning_attachments_target_type_check
      CHECK (target_type IS NULL OR target_type IN ('thread', 'reply'));
  `.execute(database);

  await sql`
    DELETE FROM learning_reports WHERE target_type = 'note';
    ALTER TABLE learning_reports DROP CONSTRAINT IF EXISTS learning_reports_target_type_check;
    ALTER TABLE learning_reports ADD CONSTRAINT learning_reports_target_type_check
      CHECK (target_type IN ('thread', 'reply'));
  `.execute(database);
}

