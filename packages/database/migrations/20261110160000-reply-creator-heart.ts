import { sql, type Kysely } from "kysely";

/**
 * The creator's heart on replies, as comments and questions already have
 * it (`learning_threads.hearted_at`): when it was given and by whom.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table learning_replies
      add column if not exists hearted_at timestamptz,
      add column if not exists hearted_by_user_id uuid
        references users (id) on delete set null
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table learning_replies
      drop column if exists hearted_by_user_id,
      drop column if exists hearted_at
  `.execute(database);
}
