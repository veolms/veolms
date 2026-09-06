import { sql, type Kysely } from "kysely";

/** Stores editable public profile data on the account rather than in browser storage. */
export async function up(database: Kysely<any>): Promise<void> {
  await database.schema
    .alterTable("users")
    .addColumn("avatar_data_url", "text")
    .addColumn("bio", "text")
    .addColumn("email_public", "boolean", (column) =>
      column.notNull().defaultTo(false),
    )
    .addColumn("mobile_public", "boolean", (column) =>
      column.notNull().defaultTo(false),
    )
    .addColumn("linkedin_url", "text")
    .addColumn("linkedin_public", "boolean", (column) =>
      column.notNull().defaultTo(false),
    )
    .addColumn("github_url", "text")
    .addColumn("github_public", "boolean", (column) =>
      column.notNull().defaultTo(false),
    )
    .addColumn("website_url", "text")
    .addColumn("website_public", "boolean", (column) =>
      column.notNull().defaultTo(false),
    )
    .execute();

  await sql`
    alter table users
      add constraint users_bio_length_valid
      check (char_length(bio) <= 160)
  `.execute(database);
}

export async function down(database: Kysely<any>): Promise<void> {
  await sql`alter table users drop constraint if exists users_bio_length_valid`.execute(
    database,
  );

  await database.schema
    .alterTable("users")
    .dropColumn("website_public")
    .dropColumn("website_url")
    .dropColumn("github_public")
    .dropColumn("github_url")
    .dropColumn("linkedin_public")
    .dropColumn("linkedin_url")
    .dropColumn("mobile_public")
    .dropColumn("email_public")
    .dropColumn("bio")
    .dropColumn("avatar_data_url")
    .execute();
}
