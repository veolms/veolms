import { loadServerConfig } from "@veolms/config";
import { createDatabase } from "./client.ts";
import { assertMigrationSuccess, createMigrator } from "./migrator.ts";

const config = loadServerConfig(process.env);
const database = createDatabase(config.DATABASE_URL);

try {
  console.log("Rolling back migration 009 to re-apply unified migration...");
  const rDown = await createMigrator(database).migrateDown();
  assertMigrationSuccess(rDown);

  console.log("Applying unified migration 009...");
  const rUp = await createMigrator(database).migrateToLatest();
  assertMigrationSuccess(rUp);

  console.log("Unified migration 009 applied successfully.");
} finally {
  await database.destroy();
}
