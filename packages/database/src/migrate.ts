import { loadServerConfig } from "@veolms/config";

import { createDatabase } from "./client.ts";
import { assertMigrationSuccess, createMigrator } from "./migrator.ts";

const config = loadServerConfig(process.env);
const database = createDatabase(config.DATABASE_URL, {
  // Migrations may build indexes on large tables; never cut them off.
  statementTimeoutMillis: 0,
  applicationName: "veolms-migrate",
});

try {
  const resultSet = await createMigrator(database).migrateToLatest();
  assertMigrationSuccess(resultSet);
} finally {
  await database.destroy();
}
