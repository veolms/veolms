import { Kysely, PostgresDialect } from "kysely";
import { Pool, types } from "pg";

import { createRoutingPool } from "./routing.ts";
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
  /**
   * This server's own database copy, for the plain reads of GET requests
   * (see routing.ts). Default DATABASE_READ_URL; none: everything uses
   * `databaseUrl`.
   */
  readUrl?: string;
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
export interface DatabasePoolMetrics {
  /** The pool's application_name, to tell multiple pools apart. */
  name: string;
  /** Configured maximum connections for this pool. */
  max: number;
  /** Connections currently open (in use + idle). */
  total: number;
  /** Open connections sitting idle. */
  idle: number;
  /** Queries queued waiting for a free connection — sustained non-zero
   * values mean the pool is the bottleneck. */
  waiting: number;
}

const poolRegistry: Array<{ name: string; max: number; pool: Pool }> = [];

/**
 * Point-in-time metrics for every pool this process created. Intended for
 * a periodic ops log line — pool starvation was previously invisible
 * (requests queued silently with no signal anywhere).
 */
export function getDatabasePoolMetrics(): DatabasePoolMetrics[] {
  return poolRegistry.map((entry) => ({
    name: entry.name,
    max: entry.max,
    total: entry.pool.totalCount,
    idle: entry.pool.idleCount,
    waiting: entry.pool.waitingCount,
  }));
}

export function createDatabase(
  databaseUrl: string,
  options: DatabasePoolOptions = {},
): Kysely<Database> {
  const statementTimeout =
    options.statementTimeoutMillis ??
    intFromEnv("DATABASE_STATEMENT_TIMEOUT_MS") ??
    30_000;

  const name =
    options.applicationName ??
    process.env.DATABASE_APPLICATION_NAME ??
    "veolms";
  const readUrl = options.readUrl ?? process.env.DATABASE_READ_URL ?? "";
  const max = options.max ?? intFromEnv("DATABASE_POOL_MAX") ?? 10;
  const newPool = (
    connectionString: string,
    poolMax: number,
    poolName: string,
  ) => {
    const pool = new Pool({
      connectionString,
      max: poolMax,
      connectionTimeoutMillis:
        options.connectionTimeoutMillis ??
        intFromEnv("DATABASE_CONNECT_TIMEOUT_MS") ??
        5_000,
      ...(statementTimeout > 0 ? { statement_timeout: statementTimeout } : {}),
      application_name: poolName,
    });
    // node-postgres emits errors from connections that are idle in the pool.
    // EventEmitter treats an `error` event without a listener as fatal, which
    // would terminate the API process when the database or network drops an
    // idle connection. The pool removes the failed client and can create a
    // replacement for the next query after this is handled.
    pool.on("error", (error) => {
      console.error("Unexpected PostgreSQL pool error", error);
    });
    poolRegistry.push({ name: poolName, max: poolMax, pool });
    return pool;
  };

  // With a copy for reads, the boss pool is small (DATABASE_WRITE_POOL_MAX):
  // every API process of every server opens one, and Postgres has a fixed
  // connection limit.
  const writer = readUrl
    ? newPool(
        databaseUrl,
        intFromEnv("DATABASE_WRITE_POOL_MAX") ?? 4,
        `${name}-write`,
      )
    : newPool(databaseUrl, max, name);
  const reader = readUrl ? newPool(readUrl, max, `${name}-read`) : undefined;
  const holdMillis =
    process.env.DATABASE_WRITE_HOLD_MS === "0"
      ? 0
      : (intFromEnv("DATABASE_WRITE_HOLD_MS") ?? 35_000);

  const pool = createRoutingPool({
    writer,
    reader,
    holdMillis,
    maxReadLagBytes:
      intFromEnv("DATABASE_READ_MAX_LAG_BYTES") ?? 16 * 1024 * 1024,
    log: (message) => console.warn(message),
  });

  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool,
    }),
  });
}
