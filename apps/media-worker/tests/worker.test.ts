import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Kysely } from "kysely";
import type { Database } from "@veolms/database";
import { loadMediaWorkerConfig } from "@veolms/config";
import { initMediaWorker, pollForNextJob } from "../src/worker.ts";

const WORKER_ID = "11111111-1111-4111-8111-111111111111";

/** Minimal stand-in for a Kysely query builder: every chain method returns
 * itself, and the terminal method resolves via the supplied callback. */
function makeChain(onTerminal: () => unknown): any {
  const chain: any = {};
  for (const m of [
    "select",
    "selectAll",
    "where",
    "orderBy",
    "limit",
    "forUpdate",
    "skipLocked",
    "set",
    "values",
  ]) {
    chain[m] = () => chain;
  }
  chain.execute = async () => onTerminal();
  chain.executeTakeFirst = async () => onTerminal();
  return chain;
}

function flushMicrotasks(times = 5): Promise<void> {
  return new Array(times)
    .fill(null)
    .reduce((p: Promise<void>) => p.then(() => undefined), Promise.resolve());
}

describe("Heartbeat lifecycle", () => {
  it("writes a heartbeat on each interval tick and stops writing after stopHeartbeat()", async (t) => {
    t.mock.timers.enable({ apis: ["setInterval", "setTimeout"] });

    let readyWrites = 0;
    let heartbeatWrites = 0;
    let eventInserts = 0;

    const db = {
      updateTable(table: string) {
        return makeChain(() => {
          if (table === "workers") {
            if (readyWrites === 0) {
              readyWrites++;
            } else {
              heartbeatWrites++;
            }
          }
          return undefined;
        });
      },
      insertInto(table: string) {
        return makeChain(() => {
          if (table === "worker_events") eventInserts++;
          return undefined;
        });
      },
    } as unknown as Kysely<Database>;

    const config = loadMediaWorkerConfig({
      WORKER_ID,
      HEARTBEAT_INTERVAL_MS: "1000",
    });

    const ctx = await initMediaWorker({ config, db });
    assert.equal(readyWrites, 1, "READY status written once on init");
    assert.equal(eventInserts, 1, "WORKER_READY event recorded once");

    t.mock.timers.tick(1000);
    await flushMicrotasks();
    t.mock.timers.tick(1000);
    await flushMicrotasks();
    assert.equal(heartbeatWrites, 2, "two heartbeat ticks fired");

    await ctx.stopHeartbeat();
    t.mock.timers.tick(5000);
    await flushMicrotasks();
    assert.equal(heartbeatWrites, 2, "no further writes after stopHeartbeat()");
  });

  it("stopHeartbeat() awaits the write already in flight before resolving", async (t) => {
    t.mock.timers.enable({ apis: ["setInterval", "setTimeout"] });

    let resolveWrite: (() => void) | undefined;
    let writeResolved = false;
    let stopResolved = false;

    const db = {
      updateTableCalls: 0,
      updateTable() {
        this.updateTableCalls += 1;
        // First call is initMediaWorker's initial READY-status write —
        // resolve it immediately so init itself doesn't hang. Only the
        // heartbeat tick (second call onward) hangs until resolveWrite().
        if (this.updateTableCalls === 1) {
          return makeChain(() => undefined);
        }
        return makeChain(
          () =>
            new Promise<void>((resolve) => {
              resolveWrite = () => {
                writeResolved = true;
                resolve();
              };
            }),
        );
      },
      insertInto() {
        return makeChain(() => undefined);
      },
    } as unknown as Kysely<Database>;

    const config = loadMediaWorkerConfig({
      WORKER_ID,
      HEARTBEAT_INTERVAL_MS: "1000",
      HEARTBEAT_DRAIN_TIMEOUT_MS: "60000",
    });

    const ctx = await initMediaWorker({ config, db });
    t.mock.timers.tick(1000);
    await flushMicrotasks();

    const stopPromise = ctx.stopHeartbeat().then(() => {
      stopResolved = true;
    });
    await flushMicrotasks();
    assert.equal(stopResolved, false, "stopHeartbeat should not resolve yet");

    resolveWrite?.();
    await stopPromise;
    assert.equal(writeResolved, true);
    assert.equal(stopResolved, true);
  });

  it("stopHeartbeat() gives up after HEARTBEAT_DRAIN_TIMEOUT_MS even if the write never resolves", async (t) => {
    t.mock.timers.enable({ apis: ["setInterval", "setTimeout"] });

    const db = {
      updateTableCalls: 0,
      updateTable() {
        this.updateTableCalls += 1;
        // First call is initMediaWorker's initial READY-status write —
        // resolve it immediately so init itself doesn't hang. The heartbeat
        // tick (second call onward) never resolves, simulating a hung DB
        // call.
        if (this.updateTableCalls === 1) {
          return makeChain(() => undefined);
        }
        return makeChain(() => new Promise<void>(() => {}));
      },
      insertInto() {
        return makeChain(() => undefined);
      },
    } as unknown as Kysely<Database>;

    const config = loadMediaWorkerConfig({
      WORKER_ID,
      HEARTBEAT_INTERVAL_MS: "1000",
      HEARTBEAT_DRAIN_TIMEOUT_MS: "2000",
    });

    const ctx = await initMediaWorker({ config, db });
    t.mock.timers.tick(1000);
    await flushMicrotasks();

    let stopResolved = false;
    const stopPromise = ctx.stopHeartbeat().then(() => {
      stopResolved = true;
    });

    await flushMicrotasks();
    assert.equal(stopResolved, false);

    t.mock.timers.tick(2000);
    await stopPromise;
    assert.equal(
      stopResolved,
      true,
      "stopHeartbeat resolves once the drain timeout elapses",
    );
  });
});

describe("pollForNextJob", () => {
  it("returns null immediately when the signal is already aborted", async () => {
    const db = {} as unknown as Kysely<Database>;
    const ctx = {
      db,
      workerId: WORKER_ID,
      config: loadMediaWorkerConfig({
        WORKER_ID,
        WORKER_IDLE_POLL_SECONDS: "1",
      }),
    } as any;

    const controller = new AbortController();
    controller.abort();

    const result = await pollForNextJob(ctx, controller.signal);
    assert.equal(result, null);
  });

  it("claims a job immediately when one is available", async () => {
    const workerRow = {
      id: WORKER_ID,
      cpu: 4,
      memory_mb: 8192,
      storage_gb: 100,
      architecture: "arm64",
    };
    const jobRow = { id: "job-1", status: "queued" };

    const db = {
      transaction() {
        return {
          execute: async (cb: (trx: unknown) => Promise<unknown>) => {
            const trx = {
              selectFrom(table: string) {
                if (table === "workers") return makeChain(() => workerRow);
                if (table === "video_jobs") return makeChain(() => jobRow);
                throw new Error(`unexpected table ${table}`);
              },
              updateTable() {
                return makeChain(() => ({ numUpdatedRows: 1n }));
              },
            };
            return cb(trx);
          },
        };
      },
    } as unknown as Kysely<Database>;

    const ctx = {
      db,
      workerId: WORKER_ID,
      config: loadMediaWorkerConfig({
        WORKER_ID,
        WORKER_IDLE_POLL_SECONDS: "1",
      }),
    } as any;

    const result = await pollForNextJob(ctx);
    assert.equal(result, "job-1");
  });

  it("waits WORKER_IDLE_POLL_SECONDS then retries exactly once before giving up", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });

    let attempts = 0;
    const workerRow = {
      id: WORKER_ID,
      cpu: 4,
      memory_mb: 8192,
      storage_gb: 100,
      architecture: "arm64",
    };

    const db = {
      transaction() {
        return {
          execute: async (cb: (trx: unknown) => Promise<unknown>) => {
            attempts++;
            const trx = {
              selectFrom(table: string) {
                if (table === "workers") return makeChain(() => workerRow);
                if (table === "video_jobs") return makeChain(() => undefined);
                throw new Error(`unexpected table ${table}`);
              },
              updateTable() {
                return makeChain(() => ({ numUpdatedRows: 1n }));
              },
            };
            return cb(trx);
          },
        };
      },
    } as unknown as Kysely<Database>;

    const ctx = {
      db,
      workerId: WORKER_ID,
      config: loadMediaWorkerConfig({
        WORKER_ID,
        WORKER_IDLE_POLL_SECONDS: "5",
      }),
    } as any;

    const resultPromise = pollForNextJob(ctx);
    await flushMicrotasks();
    assert.equal(attempts, 1, "checks once immediately");

    t.mock.timers.tick(5000);
    const result = await resultPromise;
    assert.equal(result, null);
    assert.equal(attempts, 2, "checks exactly once more after the idle wait");
  });

  it("resolves early when the signal aborts during the idle wait", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });

    let attempts = 0;
    const workerRow = {
      id: WORKER_ID,
      cpu: 4,
      memory_mb: 8192,
      storage_gb: 100,
      architecture: "arm64",
    };

    const db = {
      transaction() {
        return {
          execute: async (cb: (trx: unknown) => Promise<unknown>) => {
            attempts++;
            const trx = {
              selectFrom(table: string) {
                if (table === "workers") return makeChain(() => workerRow);
                if (table === "video_jobs") return makeChain(() => undefined);
                throw new Error(`unexpected table ${table}`);
              },
              updateTable() {
                return makeChain(() => ({ numUpdatedRows: 1n }));
              },
            };
            return cb(trx);
          },
        };
      },
    } as unknown as Kysely<Database>;

    const ctx = {
      db,
      workerId: WORKER_ID,
      config: loadMediaWorkerConfig({
        WORKER_ID,
        WORKER_IDLE_POLL_SECONDS: "30",
      }),
    } as any;

    const controller = new AbortController();
    const resultPromise = pollForNextJob(ctx, controller.signal);
    await flushMicrotasks();
    assert.equal(attempts, 1);

    controller.abort();
    const result = await resultPromise;
    assert.equal(result, null);
    assert.equal(attempts, 1, "never attempts the second claim once aborted");
  });

  it("exits immediately without idle waiting when worker status is FAILED", async () => {
    let attempts = 0;
    const workerRow = {
      id: WORKER_ID,
      status: "failed",
    };

    const db = {
      selectFrom(table: string) {
        if (table === "workers") return makeChain(() => workerRow);
        throw new Error(`unexpected table ${table}`);
      },
      transaction() {
        return {
          execute: async (cb: (trx: unknown) => Promise<unknown>) => {
            attempts++;
            const trx = {
              selectFrom(table: string) {
                if (table === "workers") return makeChain(() => undefined); // claimNextQueuedJob fails because worker is not READY
                if (table === "video_jobs") return makeChain(() => undefined);
                throw new Error(`unexpected table ${table}`);
              },
            };
            return cb(trx);
          },
        };
      },
    } as unknown as Kysely<Database>;

    const ctx = {
      db,
      workerId: WORKER_ID,
      config: loadMediaWorkerConfig({
        WORKER_ID,
        WORKER_IDLE_POLL_SECONDS: "30",
      }),
    } as any;

    const result = await pollForNextJob(ctx);
    assert.equal(result, null);
    assert.equal(attempts, 1, "only tries once and does not wait idle");
  });
});
