import { sql, type Kysely } from "kysely";

/**
 * Records who asked for each one-time code.
 *
 * Send limits were keyed on the destination only. That had two holes: a
 * signed-in user could request codes for an unlimited number of different
 * phone numbers (each number had its own allowance, so SMS spend was
 * unbounded), and anyone could spend another person's daily allowance by
 * requesting codes for their address.
 *
 * With the requester recorded, the API can cap sends per signed-in user and
 * count the daily allowance per requesting address. Both columns are
 * nullable: existing rows and the old code keep working during the
 * migrate-then-restart window.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table otp_codes
      add column if not exists requester_ip text,
      add column if not exists requester_user_id uuid
        references users(id) on delete set null
  `.execute(database);

  await sql`
    create index if not exists idx_otp_codes_requester_user
      on otp_codes (requester_user_id, created_at)
      where requester_user_id is not null
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop index if exists idx_otp_codes_requester_user`.execute(
    database,
  );
  await sql`
    alter table otp_codes
      drop column if exists requester_user_id,
      drop column if exists requester_ip
  `.execute(database);
}
