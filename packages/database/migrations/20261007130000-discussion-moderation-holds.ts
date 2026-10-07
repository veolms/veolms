import { sql, type Kysely } from "kysely";

/**
 * Lets a moderator's decision stick.
 *
 * 1. `learning_threads.locked_by_user_id`: who locked the thread. A thread
 *    author may lock and unlock their own thread, and used to be able to
 *    unlock one a moderator had locked. Existing moderator locks are
 *    recovered from the audit log.
 *
 * 2. `learning_notes.moderated_private_at`: set when a moderator takes a
 *    public note out of view. Notes had no moderation action at all, and
 *    without this mark the author could simply share the note again.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table learning_threads
      add column if not exists locked_by_user_id uuid
        references users(id) on delete set null
  `.execute(database);

  await sql`
    update learning_threads t
    set locked_by_user_id = latest.actor_user_id
    from (
      select distinct on (target_id) target_id, actor_user_id
      from learning_audit_logs
      where target_type = 'thread' and action = 'lock_thread'
      order by target_id, created_at desc
    ) latest
    where latest.target_id = t.id
      and t.is_locked
      and t.locked_by_user_id is null
      and exists (select 1 from users u where u.id = latest.actor_user_id)
  `.execute(database);

  await sql`
    alter table learning_notes
      add column if not exists moderated_private_at timestamptz
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table learning_notes
      drop column if exists moderated_private_at
  `.execute(database);
  await sql`
    alter table learning_threads
      drop column if exists locked_by_user_id
  `.execute(database);
}
