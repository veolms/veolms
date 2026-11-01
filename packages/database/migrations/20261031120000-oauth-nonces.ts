import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    create table if not exists oauth_nonces (
      token_hash text primary key,
      expires_at timestamptz not null,
      used_at    timestamptz
    )
  `.execute(database);

  await sql`
    create index if not exists oauth_nonces_expires_at_idx
      on oauth_nonces (expires_at)
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop table if exists oauth_nonces`.execute(database);
}
