import { Kysely, PostgresDialect } from "kysely";
import { Pool, types } from "pg";

import type { Database } from "./schema.ts";

// pg returns bigint (OID 20, e.g. jobs.video_size) as a string by default to
// avoid precision loss above Number.MAX_SAFE_INTEGER. Video byte counts
// never get remotely close to that, so parse to a plain number instead —
// every bigint column in this schema is treated as `number` in TypeScript.
types.setTypeParser(20, (value: string) => parseInt(value, 10));

export function createDatabase(databaseUrl: string): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString: databaseUrl }),
    }),
  });
}
