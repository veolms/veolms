import { sql, type Kysely } from "kysely";

/**
 * A team member's own title ("Lead Engineer", "Mentor"), shown as their badge
 * in chat, discussions and profile instead of the generic role name. Null
 * when an admin has not set one; the app then shows its default label.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table users
      add column if not exists team_title varchar(40)
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`alter table users drop column if exists team_title`.execute(
    database,
  );
}
