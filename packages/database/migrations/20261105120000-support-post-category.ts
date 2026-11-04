import { sql, type Kysely } from "kysely";

/**
 * Support reports can be about a post: a comment, reply or question
 * reported from Discussions arrives as a problem report with the category
 * `post` and a link to it, instead of in a moderation queue no screen showed.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table support_tickets
      drop constraint if exists support_tickets_category_valid
  `.execute(database);
  await sql`
    alter table support_tickets
      add constraint support_tickets_category_valid check (category in (
        'video', 'access', 'payment', 'account', 'bug', 'other', 'post',
        'idea', 'like', 'confusing', 'content'
      ))
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    update support_tickets set category = 'other' where category = 'post'
  `.execute(database);
  await sql`
    alter table support_tickets
      drop constraint if exists support_tickets_category_valid
  `.execute(database);
  await sql`
    alter table support_tickets
      add constraint support_tickets_category_valid check (category in (
        'video', 'access', 'payment', 'account', 'bug', 'other',
        'idea', 'like', 'confusing', 'content'
      ))
  `.execute(database);
}
