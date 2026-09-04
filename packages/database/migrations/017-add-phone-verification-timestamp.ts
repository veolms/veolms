import type { Kysely } from "kysely";

/** Tracks whether the account's stored phone number was confirmed by OTP. */
export async function up(database: Kysely<any>): Promise<void> {
  await database.schema
    .alterTable("users")
    .addColumn("phone_verified_at", "timestamptz")
    .execute();
}

export async function down(database: Kysely<any>): Promise<void> {
  await database.schema
    .alterTable("users")
    .dropColumn("phone_verified_at")
    .execute();
}
