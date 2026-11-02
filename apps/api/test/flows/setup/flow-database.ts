/**
 * Rebuilds a test database from nothing: drops it, creates it, runs every
 * migration and seeds what a real academy has after setup (roles and
 * permissions, the academy, one administrator). Each run therefore starts
 * from the same state, whatever the last one left.
 *
 * Used by prepare-database.ts (the flow tests) and by the browser tests'
 * server (test/journeys/server.ts), each on a database of its own.
 */
import pg from "pg";
import { createDatabase, grantPlatformRole } from "@veolms/database";

import {
  assertMigrationSuccess,
  createMigrator,
} from "../../../../../packages/database/src/migrator.ts";
import {
  SYSTEM_ROLES,
  seedRolesAndPermissions,
} from "../../../../../packages/database/src/seed/rbac.ts";
import { assertFlowDatabaseName } from "./flow-env.ts";
import { FLOW_ACADEMY, FLOW_ADMIN } from "./flow-fixtures.ts";

export async function rebuildTestDatabase(databaseUrl: string): Promise<void> {
  const databaseName = assertFlowDatabaseName(databaseUrl);
  const maintenanceUrl = new URL(databaseUrl);
  maintenanceUrl.pathname = "/postgres";

  const maintenance = new pg.Client({
    connectionString: maintenanceUrl.toString(),
  });
  try {
    await maintenance.connect();
  } catch (error) {
    console.error(
      `Could not reach Postgres at ${maintenanceUrl.host}. Start it first (docker compose up -d postgres).`,
    );
    throw error;
  }
  try {
    await maintenance.query(
      `drop database if exists "${databaseName}" with (force)`,
    );
    await maintenance.query(`create database "${databaseName}"`);
  } finally {
    await maintenance.end();
  }

  const database = createDatabase(databaseUrl, {
    statementTimeoutMillis: 0,
    applicationName: "veolms-test-database-prepare",
  });
  try {
    const migrations = await createMigrator(database).migrateToLatest();
    // Quiet: a run prints its tests, not a hundred migration names.
    if (migrations.error) assertMigrationSuccess(migrations);

    await seedRolesAndPermissions(database);
    await database.insertInto("academy").values(FLOW_ACADEMY).execute();
    await database.insertInto("users").values(FLOW_ADMIN).execute();
    await grantPlatformRole(database, {
      userId: FLOW_ADMIN.id,
      roleId: SYSTEM_ROLES.admin.id,
    });

    console.info(
      `Test database "${databaseName}" is ready (${migrations.results?.length ?? 0} migrations).`,
    );
  } finally {
    await database.destroy();
  }
}
