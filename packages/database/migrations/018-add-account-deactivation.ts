import type { Kysely } from "kysely";

/** Keeps deactivated accounts for retention while removing their access. */
export async function up(database: Kysely<any>): Promise<void> {
  await database.schema
    .alterTable("users")
    .addColumn("is_deleted", "boolean", (column) =>
      column.notNull().defaultTo(false),
    )
    .execute();
}

export async function down(database: Kysely<any>): Promise<void> {
  await database.schema.alterTable("users").dropColumn("is_deleted").execute();
}
