import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { test } from "node:test";

import {
  CACHE_INVALIDATION_CHANNEL,
  cacheTags,
  createCache,
  decodeInvalidation,
  encodeInvalidation,
  invalidateCache,
  publishCacheInvalidation,
  startCacheBus,
} from "@veolms/api-core";
import { createDatabase } from "@veolms/database";
import { sql } from "kysely";
import pg from "pg";

await test("tags are split across payloads that fit NOTIFY's limit, and read back", () => {
  const tags = Array.from({ length: 400 }, (_, index) =>
    cacheTags.course(
      `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    ),
  );
  const payloads = encodeInvalidation("origin", tags);
  assert.ok(payloads.length > 1);
  for (const payload of payloads) {
    assert.ok(Buffer.byteLength(payload) < 8000);
  }
  const decoded = payloads.flatMap(
    (payload) => decodeInvalidation(payload)?.t ?? [],
  );
  assert.deepEqual(decoded, tags);
  assert.equal(decodeInvalidation(payloads[0])?.o, "origin");
});

await test("a payload that is not an invalidation is ignored", () => {
  for (const payload of [
    undefined,
    "",
    "not json",
    '{"v":2,"o":"x","t":[]}',
    '{"v":1,"o":"x","t":[1]}',
  ]) {
    assert.equal(decodeInvalidation(payload), null);
  }
});

/**
 * Against a real database (local: the compose Postgres). Skipped unless
 * CACHE_BUS_TEST_DATABASE_URL is set, so the suite needs no database.
 */
const databaseUrl = process.env.CACHE_BUS_TEST_DATABASE_URL;
const quietLogger = { info() {}, warn() {}, error() {} };

async function until(condition: () => boolean, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("timed out");
    await sleep(20);
  }
}

await test(
  "another process's change clears this process's entries; ours reach the others",
  { skip: !databaseUrl },
  async () => {
    const database = createDatabase(databaseUrl!, { max: 2 });
    const watcher = new pg.Client({ connectionString: databaseUrl });
    const cache = createCache<string>({ name: "test.bus", ttlMs: 60_000 });
    const course = cacheTags.course("00000000-0000-4000-8000-000000000001");
    const bus = startCacheBus({
      connectionString: databaseUrl!,
      database,
      logger: quietLogger,
    });
    try {
      await until(() => bus.isListening());

      // Another process (the CLI, another API process) publishes.
      await cache.fetch("key", async () => "value", { tags: [course] });
      await publishCacheInvalidation(database, [course], "another-process");
      await until(() => cache.get("key") === undefined);

      // This process's own change goes out to the others.
      const received: string[] = [];
      await watcher.connect();
      watcher.on("notification", (message) =>
        received.push(message.payload ?? ""),
      );
      await watcher.query(`LISTEN ${CACHE_INVALIDATION_CHANNEL}`);
      invalidateCache([cacheTags.site]);
      await until(() => received.length > 0);
      assert.deepEqual(decodeInvalidation(received[0])?.t, [cacheTags.site]);
    } finally {
      await bus.stop();
      await watcher.end().catch(() => {});
      cache.dispose();
      await database.destroy();
    }
  },
);

await test(
  "after losing its connection the bus reconnects and clears what it may have missed",
  { skip: !databaseUrl },
  async () => {
    const database = createDatabase(databaseUrl!, { max: 2 });
    const cache = createCache<string>({
      name: "test.bus-reconnect",
      ttlMs: 60_000,
    });
    const bus = startCacheBus({
      connectionString: databaseUrl!,
      database,
      logger: quietLogger,
    });
    try {
      await until(() => bus.isListening());
      await cache.fetch("key", async () => "value");

      await sql`
      select pg_terminate_backend(pid) from pg_stat_activity
      where application_name = 'veolms-cache-bus' and pid <> pg_backend_pid()
    `.execute(database);
      await until(() => !bus.isListening());
      await until(() => bus.isListening(), 10_000);
      assert.equal(cache.get("key"), undefined);
    } finally {
      await bus.stop();
      cache.dispose();
      await database.destroy();
    }
  },
);
