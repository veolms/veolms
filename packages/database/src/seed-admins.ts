import { loadServerConfig } from "@veolms/config";

import { createDatabase } from "./client.ts";
import { seedAdminUsers } from "./seed-admin-users.ts";
import { seedRolesAndPermissions } from "./seed-rbac.ts";

const config = loadServerConfig(process.env);
const database = createDatabase(config.DATABASE_URL);

try {
  // Ensure roles and RBAC exist
  await seedRolesAndPermissions(database);
  // Seed admin users
  await seedAdminUsers(database);
} finally {
  await database.destroy();
}
