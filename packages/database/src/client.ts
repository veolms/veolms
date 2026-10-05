import { Kysely, PostgresDialect } from "kysely";
import { Pool, types } from "pg";

import type { Database } from "./schema.ts";

// pg returns bigint (OID 20, e.g. jobs.video_size) as a string by default to
// avoid precision loss above Number.MAX_SAFE_INTEGER. Video byte counts
// never get remotely close to that, so parse to a plain number instead —
// every bigint column in this schema is treated as `number` in TypeScript.
types.setTypeParser(20, (value: string) => parseInt(value, 10));

export interface DatabasePoolOptions {
  /** Max connections for THIS process's pool (pg default: 10). */
  max?: number;
  /** How long a query waits for a free connection before erroring (ms). */
  connectionTimeoutMillis?: number;
  /** Server-side statement_timeout applied to every connection (ms). */
  statementTimeoutMillis?: number;
  /** Shows up in pg_stat_activity.application_name for debugging. */
  applicationName?: string;
}

function intFromEnv(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * Creates the shared Kysely instance for a process.
 *
 * Pool behavior is tunable via options or env (options win):
 * - `DATABASE_POOL_MAX` — previously the pg default of 10 applied, which a
 *   single analytics request's parallel aggregates could exhaust by itself.
 *   Size this against the database's connection limit times the number of
 *   processes (API instances + workers), NOT just this process.
 * - `DATABASE_CONNECT_TIMEOUT_MS` (default 5000) — pg's default is 0 =
 *   wait forever, so under pool exhaustion every request queued invisibly
 *   and indefinitely instead of failing fast.
 * - `DATABASE_STATEMENT_TIMEOUT_MS` (default 30000) — bounds any single
 *   statement server-side so one runaway query cannot hold a connection
 *   (and locks) indefinitely. Set higher for one-off CLI/migration work if
 *   needed; migrations pass 0/unset to disable via env.
 */
export function createDatabase(
  databaseUrl: string,
  options: DatabasePoolOptions = {},
): Kysely<Database> {
  const statementTimeout =
    options.statementTimeoutMillis ??
    intFromEnv("DATABASE_STATEMENT_TIMEOUT_MS") ??
    30_000;

  const pool = new Pool({
    connectionString: databaseUrl,
    max: options.max ?? intFromEnv("DATABASE_POOL_MAX") ?? 10,
    connectionTimeoutMillis:
      options.connectionTimeoutMillis ??
      intFromEnv("DATABASE_CONNECT_TIMEOUT_MS") ??
      5_000,
    ...(statementTimeout > 0 ? { statement_timeout: statementTimeout } : {}),
    application_name:
      options.applicationName ??
      process.env.DATABASE_APPLICATION_NAME ??
      "veolms",
  });

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
