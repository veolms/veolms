import { sql, type Kysely } from "kysely";

/**
 * Two marks staff can put on a comment or question:
 *
 * - pinned: it opens its lesson's discussion, above everything else, newest
 *   pin first;
 * - the creator's heart: shown on the post with the avatar of whoever gave
 *   it, like a creator's heart on a video comment.
 *
 * Both are nullable columns, so the old code keeps working between the
 * migration and the restart.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table learning_threads
      add column if not exists pinned_at timestamptz,
      add column if not exists pinned_by_user_id uuid
        references users(id) on delete set null,
      add column if not exists hearted_at timestamptz,
      add column if not exists hearted_by_user_id uuid
        references users(id) on delete set null
  `.execute(database);
  await sql`
    create index if not exists learning_threads_lesson_pinned_idx
      on learning_threads (lesson_id, pinned_at desc)
      where pinned_at is not null
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop index if exists learning_threads_lesson_pinned_idx`.execute(
    database,
  );
  await sql`
    alter table learning_threads
      drop column if exists hearted_by_user_id,
      drop column if exists hearted_at,
      drop column if exists pinned_by_user_id,
      drop column if exists pinned_at
  `.execute(database);
}
