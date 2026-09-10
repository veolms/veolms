import { loadServerConfig } from "@veolms/config";
import { NO_MIGRATIONS } from "kysely/migration";
import { sql } from "kysely";

import { createDatabase } from "./client.ts";
import { assertMigrationSuccess, createMigrator } from "./migrator.ts";

const config = loadServerConfig(process.env);
const database = createDatabase(config.DATABASE_URL);

try {
  const migrator = createMigrator(database);
  try {
    assertMigrationSuccess(await migrator.migrateTo(NO_MIGRATIONS));
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes("corrupted migrations: previously executed")
    ) {
      throw error;
    }

    console.warn(
      "Migration history is stale; rebuilding the public schema before applying current migrations.",
    );
    await sql.raw("DROP SCHEMA public CASCADE").execute(database);
    await sql.raw("CREATE SCHEMA public").execute(database);
  }
  assertMigrationSuccess(await migrator.migrateToLatest());
} finally {
  await database.destroy();
}
