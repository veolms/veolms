import type { Kysely } from "kysely";

/**
 * Compatibility placeholder for databases that used the old, prematurely
 * numbered fleet migration. It intentionally remains empty; migration 014
 * applies the fleet test schema for both fresh and existing databases.
 */
export async function up(_database: Kysely<unknown>): Promise<void> {}

export async function down(_database: Kysely<unknown>): Promise<void> {}
