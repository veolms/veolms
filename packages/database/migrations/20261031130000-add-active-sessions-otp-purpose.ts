import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table otp_codes
      drop constraint if exists otp_codes_purpose_valid
  `.execute(database);

  await sql`
    alter table otp_codes
      add constraint otp_codes_purpose_valid
      check (
        purpose in (
          'login',
          'registration',
          'email_verification',
          'phone_verification',
          'active_sessions_verification'
        )
      )
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table otp_codes
      drop constraint if exists otp_codes_purpose_valid
  `.execute(database);

  await sql`
    delete from otp_codes
    where purpose = 'active_sessions_verification'
  `.execute(database);

  await sql`
    alter table otp_codes
      add constraint otp_codes_purpose_valid
      check (
        purpose in (
          'login',
          'registration',
          'email_verification',
          'phone_verification'
        )
      )
  `.execute(database);
}
