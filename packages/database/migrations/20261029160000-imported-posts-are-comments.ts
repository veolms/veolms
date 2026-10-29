import { sql, type Kysely } from "kysely";

/**
 * Posts imported from TagMango had no kind there: its lessons kept every post
 * under one "qna" list. The importer guessed, and any post with a "?" became
 * a Q&A question, so ordinary comments showed as Q&A. It also copied the
 * post's "answered" flag onto every one of its replies, so replies to
 * comments count as accepted answers (and sort as such).
 *
 * Imported posts and replies are the ones with name-based (version 5) ids,
 * made from the TagMango ids; posts written on VeoLMS get random (version 4)
 * ids. Every imported question becomes a comment, unless someone accepted an
 * answer to it on VeoLMS since, which makes it a real question. Replies keep
 * an acceptance only where it is their post's accepted answer.
 *
 * What changes is copied first into two tables, so `down` puts it back.
 */
const IMPORTED = sql`substr(id::text, 15, 1) = '5'`;

export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    create table if not exists imported_thread_kind_backup (
      id uuid primary key,
      kind text not null
    )
  `.execute(database);
  await sql`
    create table if not exists imported_reply_accepted_backup (
      id uuid primary key
    )
  `.execute(database);

  await sql`
    insert into imported_thread_kind_backup (id, kind)
    select id, kind from learning_threads
    where ${IMPORTED}
      and kind = 'question'
      and accepted_answer_id is null
    on conflict (id) do nothing
  `.execute(database);
  // Not their `updated_at`: this is not activity on the post.
  await sql`
    update learning_threads set kind = 'comment'
    where id in (select id from imported_thread_kind_backup)
  `.execute(database);

  await sql`
    insert into imported_reply_accepted_backup (id)
    select r.id from learning_replies r
    join learning_threads t on t.id = r.thread_id
    where substr(r.id::text, 15, 1) = '5'
      and r.is_accepted = true
      and t.accepted_answer_id is distinct from r.id
    on conflict (id) do nothing
  `.execute(database);
  await sql`
    update learning_replies set is_accepted = false
    where id in (select id from imported_reply_accepted_backup)
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    update learning_threads t set kind = b.kind
    from imported_thread_kind_backup b
    where b.id = t.id
  `.execute(database);
  await sql`
    update learning_replies set is_accepted = true
    where id in (select id from imported_reply_accepted_backup)
  `.execute(database);
  await sql`drop table if exists imported_thread_kind_backup`.execute(database);
  await sql`drop table if exists imported_reply_accepted_backup`.execute(
    database,
  );
}
