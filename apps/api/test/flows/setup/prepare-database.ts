/**
 * Rebuilds the flow tests' database before a run (see flow-database.ts).
 *
 * Run by `pnpm --filter @veolms/api test:flows`; not meant to be imported.
 */
import { FLOW_DATABASE_URL } from "./flow-env.ts";
import { rebuildTestDatabase } from "./flow-database.ts";

await rebuildTestDatabase(FLOW_DATABASE_URL);
