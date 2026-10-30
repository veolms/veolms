import { sql, type Kysely } from "kysely";

/**
 * Every one-time code request counts the codes its network address asked for
 * recently (ten minutes, and a day for sign-up codes). otp_codes had no index
 * that starts with the requesting address, so that count read the whole
 * append-only table.
 *
 * Deploy note: a plain CREATE INDEX, as Kysely migrations are transactional
 * and that precludes CONCURRENTLY. Where otp_codes is already large, create
 * the index by hand with CREATE INDEX CONCURRENTLY first; IF NOT EXISTS then
 * skips it here.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    create index if not exists idx_otp_codes_requester_ip
      on otp_codes (requester_ip, created_at)
      where requester_ip is not null
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop index if exists idx_otp_codes_requester_ip`.execute(database);
}
