import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { Kysely } from "kysely";
import {
  FileMigrationProvider,
  Migrator,
  type MigrationResultSet,
} from "kysely/migration";

import type { Database } from "./schema.ts";

export function createMigrator(database: Kysely<Database>): Migrator {
  return new Migrator({
    db: database,
    allowUnorderedMigrations: true,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: fileURLToPath(new URL("../migrations", import.meta.url)),
      import: async (migrationPath) =>
        import(pathToFileURL(migrationPath).href),
    }),
  });
}

export function assertMigrationSuccess(resultSet: MigrationResultSet): void {
  for (const result of resultSet.results ?? []) {
    if (result.status === "Success") {
      console.info(`Migration ${result.migrationName}: ${result.direction}`);
    }
  }

  if (resultSet.error) {
    throw resultSet.error;
  }
}
