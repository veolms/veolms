import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    create index if not exists idx_learning_follows_thread
      on learning_follows (thread_id)
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    drop index if exists idx_learning_follows_thread
  `.execute(database);
}
