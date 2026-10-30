import { sql, type Kysely } from "kysely";

/**
 * Tracks avatar objects independently from the user's active avatar URL.
 * Uploaded avatars are retained as a small history; provider avatars are
 * stored in the same table so cleanup can explicitly exclude them.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await database.schema
    .createTable("user_avatars")
    .ifNotExists()
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("user_id", "uuid", (column) =>
      column.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("source", "text", (column) => column.notNull())
    .addColumn("storage_prefix", "text", (column) => column.notNull())
    .addColumn("avatar_data_url", "text", (column) => column.notNull())
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("last_used_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addCheckConstraint(
      "user_avatars_source_valid",
      sql`source in ('upload', 'google', 'github')`,
    )
    .addUniqueConstraint("user_avatars_storage_prefix_unique", [
      "storage_prefix",
    ])
    .execute();

  await database.schema
    .createIndex("idx_user_avatars_user_source_created")
    .ifNotExists()
    .on("user_avatars")
    .columns(["user_id", "source", "created_at"])
    .execute();

  await database.schema
    .createIndex("idx_user_avatars_user_created")
    .ifNotExists()
    .on("user_avatars")
    .columns(["user_id", "created_at"])
    .execute();
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await database.schema
    .dropIndex("idx_user_avatars_user_created")
    .ifExists()
    .execute();
  await database.schema
    .dropIndex("idx_user_avatars_user_source_created")
    .ifExists()
    .execute();
  await database.schema.dropTable("user_avatars").ifExists().execute();
}
