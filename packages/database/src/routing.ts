import { AsyncLocalStorage } from "node:async_hooks";

import type { Pool, PoolClient, QueryResult } from "pg";

/**
 * Reads on this server's own database copy, everything else on the boss.
 *
 * With a read URL (DATABASE_READ_URL, the copy on this machine) the API's
 * GET and HEAD requests send their plain SELECTs to the copy, which shows
 * every confirmed write (the boss waits for its guaranteed copies to apply
 * each commit). Everything else goes to the boss through the write URL
 * (DATABASE_URL, the local HAProxy): writes, transactions, locks, SELECT
 * ... FOR UPDATE, and all background work, which runs outside a request.
 * A statement that turns out to write on the copy (Postgres refuses it,
 * 25006, before doing anything) is run again on the boss.
 *
 * The copy is used only while it keeps up: once a second its position is
 * compared with the boss's, and reads go to the boss while it is behind or
 * either check fails.
 *
 * Kysely keeps one connection object per pool client, so the copy's own
 * clients are handed to it (never a new wrapper per checkout), each taught
 * once to pass the statements that belong on the boss to a boss connection.
 */

const readContext = new AsyncLocalStorage<true>();

/** From here on in this async context, plain reads may use the copy. */
export function preferReadCopy(): void {
  readContext.enterWith(true);
}

/** Whether plain reads may use the copy in the current async context. */
export function isReadCopyPreferred(): boolean {
  return readContext.getStore() === true;
}

/** Runs `work` with plain reads allowed on the copy. */
export function withReadCopy<T>(work: () => T): T {
  return readContext.run(true, work);
}

const WRITING_SELECT =
  /\bfor\s+(update|no\s+key\s+update|share|key\s+share)\b|\bpg_advisory|\bnextval\s*\(|\bsetval\s*\(|\bpg_notify\s*\(|\bset_config\s*\(/i;

/** Whether a statement only reads (and may run on the copy). */
export function isPlainRead(sql: string): boolean {
  const head = /^\s*(?:\/\*[\s\S]*?\*\/\s*)*(\w+)/
    .exec(sql)?.[1]
    ?.toLowerCase();
  if (head === "select" || head === "values" || head === "show") {
    return !WRITING_SELECT.test(sql);
  }
  if (head === "with") {
    return (
      !/\b(insert|update|delete|merge)\b/i.test(sql) &&
      !WRITING_SELECT.test(sql)
    );
  }
  return false;
}

function statementHead(sql: string): string {
  return /^\s*(\w+)/.exec(sql)?.[1]?.toLowerCase() ?? "";
}

/**
 * Errors that mean the boss could not be reached at all, so nothing ran:
 * safe to wait and try again. Anything that happens after a statement was
 * sent is never retried here (it may have committed).
 */
export function isConnectFailure(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  const code = e?.code ?? "";
  if (
    [
      "ECONNREFUSED",
      "ECONNRESET",
      "ETIMEDOUT",
      "EHOSTUNREACH",
      "ENETUNREACH",
      "EPIPE",
      "57P01", // admin_shutdown
      "57P02", // crash_shutdown
      "57P03", // cannot_connect_now (starting up, shutting down, recovering)
      "08001",
      "08006",
    ].includes(code)
  ) {
    return true;
  }
  const message = e?.message ?? "";
  return /timeout exceeded when trying to connect|Connection terminated|the database system is (starting up|shutting down|in recovery mode)/i.test(
    message,
  );
}

/**
 * Whether each pool can currently reach the boss, from the connections it
 * opens anyway (no extra queries): failing since when, or null.
 */
const bossHealth: Array<{ failingSince: number | null }> = [];

/**
 * True when some pool has not been able to reach the boss for `forMillis`:
 * this server is cut off (or a takeover is running), so the proxy in front
 * should send its users to a server that can. False while no connection has
 * been tried.
 */
export function isDatabaseBossUnreachable(forMillis = 5_000): boolean {
  const now = Date.now();
  return bossHealth.some(
    (health) =>
      health.failingSince !== null && now - health.failingSince >= forMillis,
  );
}

class ReadOnlyBossError extends Error {
  code = "25006";
}

export interface RoutingPoolOptions {
  writer: Pool;
  reader?: Pool;
  /** How long a connection to the boss is waited for (0: not at all). */
  holdMillis: number;
  /** How far behind the boss the copy may be and still serve reads. */
  maxReadLagBytes: number;
  log?: (message: string, detail?: Record<string, unknown>) => void;
}

export interface RoutingPool {
  /** The boss pool's settings (Kysely uses them to cancel a query). */
  options: Pool["options"];
  connect(): Promise<PoolClient>;
  end(): Promise<void>;
  /** Whether reads currently use the copy (always false without one). */
  readCopyInUse(): boolean;
}

type QueryFunction = (text: unknown, values?: unknown) => Promise<QueryResult>;

export function createRoutingPool(options: RoutingPoolOptions): RoutingPool {
  const { writer, reader } = options;
  const writable = new WeakSet<PoolClient>();
  const health: { failingSince: number | null } = { failingSince: null };
  bossHealth.push(health);
  const bossFailed = () => {
    health.failingSince ??= Date.now();
  };
  const bossAnswered = () => {
    health.failingSince = null;
  };
  /** Each copy client's own query, before it was taught to route. */
  const copyQuery = new WeakMap<PoolClient, QueryFunction>();
  /** Closes the boss connection a copy client still holds for a transaction. */
  const leftOpen = new WeakMap<PoolClient, () => void>();
  let readCopyHealthy = false;
  let checkTimer: NodeJS.Timeout | undefined;
  let startChecks: () => Promise<void> = async () => {};

  const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

  /**
   * A connection to the boss. While a takeover is going on (nothing
   * answers, or the node answering is no longer the boss) it waits and
   * tries again, up to holdMillis, so the request is slower but succeeds.
   */
  async function connectWriter(): Promise<PoolClient> {
    const deadline = Date.now() + options.holdMillis;
    let delay = 250;
    for (;;) {
      try {
        const client = await writer.connect();
        if (writable.has(client)) {
          bossAnswered();
          return client;
        }
        const { rows } = await client.query<{ recovery: boolean }>(
          "select pg_is_in_recovery() as recovery",
        );
        if (rows[0]?.recovery) {
          client.release(true);
          throw new ReadOnlyBossError(
            "The database answering is not the boss.",
          );
        }
        writable.add(client);
        bossAnswered();
        return client;
      } catch (error) {
        const retryable =
          error instanceof ReadOnlyBossError || isConnectFailure(error);
        if (retryable) bossFailed();
        if (!retryable || Date.now() + delay > deadline) throw error;
        await sleep(delay);
        delay = Math.min(delay * 2, 1_000);
      }
    }
  }

  /** Runs one statement on a boss connection taken just for it. */
  async function onBossOnce(
    text: unknown,
    values: unknown,
  ): Promise<QueryResult> {
    const client = await connectWriter();
    try {
      return await (client.query as QueryFunction).call(client, text, values);
    } finally {
      client.release();
    }
  }

  // When a connection dies while checked out (the boss stopping mid-query),
  // pg rejects the query and also emits "error" on the client, which the pool
  // only listens to while the client is idle: unhandled, it would crash the
  // process. The query's own rejection reports the failure.
  const keepAlive = (client: PoolClient) => {
    client.on("error", () => {});
  };
  writer.on("connect", keepAlive);

  if (reader) {
    // Each copy client is taught once (Kysely keeps one object per client).
    reader.on("connect", (client: PoolClient) => {
      keepAlive(client);
      const onCopy = client.query.bind(client) as QueryFunction;
      copyQuery.set(client, onCopy);
      let pinned: PoolClient | undefined;

      const releasePinned = (error?: boolean | Error) => {
        const boss = pinned;
        pinned = undefined;
        boss?.release(error);
      };
      leftOpen.set(client, () => releasePinned(true));

      (client as { query: QueryFunction }).query = async (text, values) => {
        // Cursors (streamed reads) stay on the copy.
        const sql =
          typeof text === "string"
            ? text
            : typeof (text as { text?: unknown })?.text === "string"
              ? (text as { text: string }).text
              : null;
        if (sql === null) return onCopy(text, values);

        const head = statementHead(sql);
        if (pinned) {
          // Inside a transaction: everything on its boss connection.
          try {
            return await (pinned.query as QueryFunction).call(
              pinned,
              text,
              values,
            );
          } finally {
            if (
              head === "commit" ||
              head === "rollback" ||
              head === "end" ||
              head === "abort"
            ) {
              releasePinned();
            }
          }
        }
        if (head === "begin" || head === "start") {
          pinned = await connectWriter();
          try {
            return await (pinned.query as QueryFunction).call(
              pinned,
              text,
              values,
            );
          } catch (error) {
            releasePinned(true);
            throw error;
          }
        }
        if (!readCopyHealthy || !isPlainRead(sql))
          return onBossOnce(text, values);
        try {
          return await onCopy(text, values);
        } catch (error) {
          // The copy refused a write before doing anything: run it on the boss.
          if ((error as { code?: string }).code === "25006") {
            return onBossOnce(text, values);
          }
          throw error;
        }
      };
    });
    // pg-pool gives each checkout a new release(), so a transaction left open
    // on the boss is closed from the pool's release event instead (closing
    // the connection rolls it back).
    reader.on("release", (_error: Error | undefined, client: PoolClient) => {
      leftOpen.get(client)?.();
    });

    // Reads stay on the copy only while it keeps up with the boss.
    const check = async () => {
      let healthy = false;
      try {
        // Asked of the copy itself, not through the routing above.
        const client = await reader.connect();
        let row: { recovery: boolean; lsn: string | null } | undefined;
        try {
          const ask =
            copyQuery.get(client) ??
            (client.query.bind(client) as QueryFunction);
          const copy = await ask(
            "select pg_is_in_recovery() as recovery, pg_last_wal_replay_lsn()::text as lsn",
          );
          row = copy.rows[0] as typeof row;
        } finally {
          client.release();
        }
        if (row && !row.recovery) {
          healthy = true; // This server's database is the boss itself.
        } else if (row?.lsn) {
          const boss = await writer.query<{ lag: string }>(
            "select pg_wal_lsn_diff(pg_current_wal_lsn(), $1::pg_lsn)::text as lag",
            [row.lsn],
          );
          healthy =
            Number(boss.rows[0]?.lag ?? Infinity) <= options.maxReadLagBytes;
          bossAnswered();
        }
      } catch {
        healthy = false;
      }
      if (healthy !== readCopyHealthy) {
        options.log?.(
          healthy
            ? "Reads use this server's database copy"
            : "Reads go to the boss: this server's copy is behind or unreachable",
        );
      }
      readCopyHealthy = healthy;
    };
    // Started by the first read, so processes that never read from the
    // copy (CLIs, background workers) never open a connection to it.
    startChecks = async () => {
      if (checkTimer) return;
      checkTimer = setInterval(() => void check(), 1_000);
      checkTimer.unref();
      await check();
    };
  }

  return {
    options: writer.options,
    async connect() {
      if (reader && readContext.getStore() === true) {
        if (!checkTimer) await startChecks();
        // Statements are routed one by one (see the copy client above).
        return await reader.connect();
      }
      return await connectWriter();
    },
    async end() {
      clearInterval(checkTimer);
      await Promise.all([writer.end(), reader?.end()]);
    },
    readCopyInUse: () => Boolean(reader) && readCopyHealthy,
  };
}
