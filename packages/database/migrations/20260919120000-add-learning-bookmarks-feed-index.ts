import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    create index if not exists idx_learning_bookmarks_user_created_id
      on learning_bookmarks (user_id, created_at desc, id desc)
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    drop index if exists idx_learning_bookmarks_user_created_id
  `.execute(database);
}
