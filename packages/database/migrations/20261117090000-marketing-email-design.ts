import { sql, type Kysely } from "kysely";

/**
 * A marketing email's look (creator-features/34): its theme, accent colour,
 * font and header alignment. Checked by the contracts' schema on the way
 * in; `{}` reads as the default design, so emails written before this
 * keep looking the same.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table marketing_emails
      add column if not exists design jsonb not null default '{}'::jsonb
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`alter table marketing_emails drop column if exists design`.execute(
    database,
  );
}
