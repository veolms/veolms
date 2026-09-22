import { Kysely, PostgresDialect } from "kysely";
import { Pool, types } from "pg";

import type { Database } from "./schema.ts";

// pg returns bigint (OID 20, e.g. jobs.video_size) as a string by default to
// avoid precision loss above Number.MAX_SAFE_INTEGER. Video byte counts
// never get remotely close to that, so parse to a plain number instead —
// every bigint column in this schema is treated as `number` in TypeScript.
types.setTypeParser(20, (value: string) => parseInt(value, 10));

export function createDatabase(databaseUrl: string): Kysely<Database> {
  const pool = new Pool({ connectionString: databaseUrl });

  // node-postgres emits errors from connections that are idle in the pool.
  // EventEmitter treats an `error` event without a listener as fatal, which
  // would terminate the API process when the database or network drops an
  // idle connection. The pool removes the failed client and can create a
  // replacement for the next query after this is handled.
  pool.on("error", (error) => {
    console.error("Unexpected PostgreSQL pool error", error);
  });

  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool,
    }),
  });
}
