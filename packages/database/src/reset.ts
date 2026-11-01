import { loadServerConfig } from "@veolms/config";
import { NO_MIGRATIONS } from "kysely/migration";
import { sql } from "kysely";

import { createDatabase } from "./client.ts";
import { assertMigrationSuccess, createMigrator } from "./migrator.ts";

const config = loadServerConfig(process.env);
const database = createDatabase(config.DATABASE_URL, {
  statementTimeoutMillis: 0,
  applicationName: "veolms-reset",
});

try {
  const migrator = createMigrator(database);
  try {
    assertMigrationSuccess(await migrator.migrateTo(NO_MIGRATIONS));
  } catch (error) {
    console.warn(
      "Migration down failed or history is stale; rebuilding the public schema before applying current migrations.",
      error,
    );
    await sql.raw("DROP SCHEMA public CASCADE").execute(database);
    await sql.raw("CREATE SCHEMA public").execute(database);
  }
  assertMigrationSuccess(await migrator.migrateToLatest());
} finally {
  await database.destroy();
}
