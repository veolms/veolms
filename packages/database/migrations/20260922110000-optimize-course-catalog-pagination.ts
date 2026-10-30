import type { Kysely } from "kysely";

/**
 * Supports the public course catalogue's status/deletion filters and
 * created-at cursor ordering without scanning the complete catalogue.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createIndex("courses_catalog_status_deleted_created_idx")
    .ifNotExists()
    .on("courses")
    .columns(["status", "deleted_at", "created_at", "id"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .dropIndex("courses_catalog_status_deleted_created_idx")
    .ifExists()
    .execute();
}
