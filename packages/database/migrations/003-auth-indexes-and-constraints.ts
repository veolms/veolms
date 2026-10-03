import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  // Every authenticated request looks up `sessions` by `token_hash`; without an
  // index this is a sequential scan. The hash is derived from a random 32-byte
  // token, so uniqueness also holds as an invariant, not just an optimization.
  await database.schema
    .createIndex("sessions_token_hash_unique")
    .on("sessions")
    .column("token_hash")
    .unique()
    .execute();

  // WebAuthn credential IDs must be unique across all users per the spec.
  await database.schema
    .createIndex("passkeys_credential_id_unique")
    .on("passkeys")
    .column("credential_id")
    .unique()
    .execute();

  // Supports the identifier/identifier_type/purpose lookup used for both
  // issuing and verifying OTPs. Partial on `consumed_at` since only
  // unconsumed codes are ever queried.
  await database.schema
    .createIndex("otp_codes_lookup")
    .on("otp_codes")
    .columns(["identifier", "identifier_type", "purpose"])
    .where(sql.ref("consumed_at"), "is", null)
    .execute();

  // Supports the user_id/code_hash lookup used to redeem a backup code.
  await database.schema
    .createIndex("mfa_backup_codes_lookup")
    .on("mfa_backup_codes")
    .columns(["user_id", "code_hash"])
    .where(sql.ref("used_at"), "is", null)
    .execute();

  // Supports the user_id/type lookup used to find the active WebAuthn
  // registration/authentication challenge for a user.
  await database.schema
    .createIndex("webauthn_challenges_lookup")
    .on("webauthn_challenges")
    .columns(["user_id", "type"])
    .where(sql.ref("consumed_at"), "is", null)
    .execute();

  // `identifier_type` and `purpose` are app-level unions stored as free text;
  // constrain them the same way `courses.status` already is.
  await sql`
    alter table otp_codes
      add constraint otp_codes_identifier_type_valid
      check (identifier_type in ('email', 'phone'))
  `.execute(database);

  await sql`
    alter table otp_codes
      add constraint otp_codes_purpose_valid
      check (purpose in ('login', 'registration', 'email_verification', 'phone_verification'))
  `.execute(database);

  await sql`
    alter table webauthn_challenges
      add constraint webauthn_challenges_type_valid
      check (type in ('registration', 'authentication'))
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`alter table webauthn_challenges drop constraint if exists webauthn_challenges_type_valid`.execute(
    database,
  );
  await sql`alter table otp_codes drop constraint if exists otp_codes_purpose_valid`.execute(
    database,
  );
  await sql`alter table otp_codes drop constraint if exists otp_codes_identifier_type_valid`.execute(
    database,
  );

  await database.schema.dropIndex("webauthn_challenges_lookup").ifExists().execute();
  await database.schema.dropIndex("mfa_backup_codes_lookup").ifExists().execute();
  await database.schema.dropIndex("otp_codes_lookup").ifExists().execute();
  await database.schema.dropIndex("passkeys_credential_id_unique").ifExists().execute();
  await database.schema.dropIndex("sessions_token_hash_unique").ifExists().execute();
}
