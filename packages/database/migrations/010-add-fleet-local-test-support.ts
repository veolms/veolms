import type { Kysely } from "kysely";

/**
 * Compatibility placeholder. This migration originally ran before the fleet
 * tables were created by 011-create-fleet-manager-tables.ts. Keep the name in
 * the migration history, but apply the fleet test schema in migration 014 so
 * fresh databases and existing databases follow the same ordering.
 */
export async function up(_database: Kysely<unknown>): Promise<void> {}

export async function down(_database: Kysely<unknown>): Promise<void> {}
