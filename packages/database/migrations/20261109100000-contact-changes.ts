import { sql, type Kysely } from "kysely";

/**
 * Changing one's own email address or mobile number (contact-change in the
 * API). A change is first proven with a code sent to the current value
 * (the new `contact_change` code purpose), then with one sent to the new
 * value; `contact_changes` keeps where each change stands between those
 * steps, for every API instance to see.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table otp_codes drop constraint if exists otp_codes_purpose_valid
  `.execute(database);
  await sql`
    alter table otp_codes
      add constraint otp_codes_purpose_valid
      check (purpose in ('login', 'registration', 'email_verification',
                         'phone_verification', 'contact_change'))
  `.execute(database);

  await sql`
    create table if not exists contact_changes (
      id uuid primary key,
      user_id uuid not null references users (id) on delete cascade,
      channel text not null check (channel in ('email', 'phone')),
      current_value text,
      current_proven_at timestamptz,
      new_value text,
      expires_at timestamptz not null,
      completed_at timestamptz,
      created_at timestamptz not null default now()
    )
  `.execute(database);
  await sql`
    create index if not exists idx_contact_changes_user_channel
      on contact_changes (user_id, channel, created_at desc)
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop table if exists contact_changes`.execute(database);
  await sql`delete from otp_codes where purpose = 'contact_change'`.execute(
    database,
  );
  await sql`
    alter table otp_codes drop constraint if exists otp_codes_purpose_valid
  `.execute(database);
  await sql`
    alter table otp_codes
      add constraint otp_codes_purpose_valid
      check (purpose in ('login', 'registration', 'email_verification',
                         'phone_verification'))
  `.execute(database);
}
