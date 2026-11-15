import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";

import {
  createRoutingPool,
  withReadCopy,
  type AcquiredConnection,
} from "@veolms/database";
import type { Pool, PoolClient } from "pg";

/** A pg-like client that records the statements it was sent. */
class FakeClient extends EventEmitter {
  readonly sent: string[] = [];
  readonly releases: Array<boolean | Error | undefined> = [];
  private readonly recovery: boolean;
  constructor(recovery: boolean) {
    super();
    this.recovery = recovery;
  }
  query = async (text: unknown) => {
    const sql = typeof text === "string" ? text : String(text);
    this.sent.push(sql);
    return {
      rows: [{ recovery: this.recovery, lsn: null, lag: "0" }],
    };
  };
  release = (error?: boolean | Error) => {
    this.releases.push(error);
  };
}

/** A pg-like pool that hands out one client, emitting "connect" once. */
class FakePool extends EventEmitter {
  readonly options = {};
  readonly client: FakeClient;
  private connected = false;
  constructor(recovery: boolean) {
    super();
    this.client = new FakeClient(recovery);
  }
  async connect() {
    if (!this.connected) {
      this.connected = true;
      this.emit("connect", this.client);
    }
    return this.client;
  }
  async query(text: unknown) {
    return await this.client.query(text);
  }
  async end() {}
}

function pools(options: { reader?: boolean } = {}) {
  const writer = new FakePool(false);
  const reader = options.reader ? new FakePool(true) : undefined;
  return { writer, reader };
}

await test("without a hook, a connection is handed out as before", async () => {
  const { writer } = pools();
  const pool = createRoutingPool({
    writer: writer as unknown as Pool,
    holdMillis: 0,
    maxReadLagBytes: 0,
  });
  const client = await pool.connect();
  assert.equal(client, writer.client as unknown as PoolClient);
  assert.deepEqual(writer.client.sent, [
    "select pg_is_in_recovery() as recovery",
  ]);
});

await test("the hook runs on the boss connection every time it is taken", async () => {
  const { writer } = pools();
  const seen: AcquiredConnection[] = [];
  const pool = createRoutingPool({
    writer: writer as unknown as Pool,
    holdMillis: 0,
    maxReadLagBytes: 0,
    onConnectionAcquired: async (connection) => {
      seen.push(connection);
      await connection.query("select set_config('app.x', $1, false)", ["a"]);
    },
  });
  await pool.connect();
  await pool.connect();
  assert.equal(seen.length, 2);
  assert.equal(seen[0]?.role, "boss");
  assert.equal(seen[0]?.key, seen[1]?.key, "same key for the same connection");
  assert.equal(
    writer.client.sent.filter((sql) => sql.startsWith("select set_config"))
      .length,
    2,
  );
});

await test("a failing hook releases the connection and fails the checkout", async () => {
  const { writer } = pools();
  const pool = createRoutingPool({
    writer: writer as unknown as Pool,
    holdMillis: 0,
    maxReadLagBytes: 0,
    onConnectionAcquired: () => {
      throw new Error("no academy");
    },
  });
  await assert.rejects(pool.connect(), /no academy/);
  assert.deepEqual(writer.client.releases, [true]);
});

await test("on the copy, the hook's statement runs on the copy itself, not routed to the boss", async () => {
  const { writer, reader } = pools({ reader: true });
  const roles: string[] = [];
  const pool = createRoutingPool({
    writer: writer as unknown as Pool,
    reader: reader as unknown as Pool,
    holdMillis: 0,
    maxReadLagBytes: 1024,
    onConnectionAcquired: async (connection) => {
      roles.push(connection.role);
      // Not a plain read, so the copy client's routing would send it to
      // the boss: the hook must bypass that routing.
      await connection.query("set local app.x = 'a'");
    },
  });
  await withReadCopy(async () => {
    await pool.connect();
  });
  assert.deepEqual(roles, ["copy"]);
  assert.ok(reader?.client.sent.includes("set local app.x = 'a'"));
  assert.ok(!writer.client.sent.includes("set local app.x = 'a'"));
  await pool.end();
});
