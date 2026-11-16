import { sql, type Kysely } from "kysely";

/**
 * When the academy's link was first copied or shared from the admin home's
 * "first five moves", which ticks that move.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table academy add column if not exists link_shared_at timestamptz
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`alter table academy drop column if exists link_shared_at`.execute(
    database,
  );
}
