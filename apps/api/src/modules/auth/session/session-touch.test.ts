import assert from "node:assert/strict";
import { test } from "node:test";

import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";

import { touchSessionInBackground } from "./session.service.ts";

/** A transaction stand-in that records each `update sessions` it is asked for. */
function fakeDatabase(fail = false) {
  const writes: { id: unknown; at: unknown }[] = [];
  const database = {
    isTransaction: true,
    updateTable(table: string) {
      assert.equal(table, "sessions");
      let at: unknown;
      const chain = {
        set(values: { last_used_at: unknown }) {
          at = values.last_used_at;
          return chain;
        },
        where(_column: string, _op: string, id: unknown) {
          return {
            async execute() {
              if (fail) throw new Error("database unavailable");
              writes.push({ id, at });
            },
          };
        },
      };
      return chain;
    },
  };
  return { database: database as unknown as Kysely<Database>, writes };
}

await test("a session is written at most once per 15 minutes per process", async () => {
  const { database, writes } = fakeDatabase();
  const t0 = Date.parse("2026-11-05T18:00:00Z");
  await touchSessionInBackground(database, "s-1", t0);
  assert.equal(touchSessionInBackground(database, "s-1", t0 + 60_000), null);
  assert.equal(
    touchSessionInBackground(database, "s-1", t0 + 14 * 60_000),
    null,
  );
  await touchSessionInBackground(database, "s-1", t0 + 15 * 60_000);
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[0], { id: "s-1", at: new Date(t0) });
});

await test("other sessions are written independently", async () => {
  const { database, writes } = fakeDatabase();
  const t0 = Date.parse("2026-11-05T19:00:00Z");
  await touchSessionInBackground(database, "s-2", t0);
  await touchSessionInBackground(database, "s-3", t0);
  assert.deepEqual(
    writes.map((w) => w.id),
    ["s-2", "s-3"],
  );
});

await test("a failed write never fails the request and is tried again next time", async () => {
  const broken = fakeDatabase(true);
  const t0 = Date.parse("2026-11-05T20:00:00Z");
  await assert.doesNotReject(
    touchSessionInBackground(broken.database, "s-4", t0) ?? Promise.resolve(),
  );
  const { database, writes } = fakeDatabase();
  await touchSessionInBackground(database, "s-4", t0 + 1_000);
  assert.equal(writes.length, 1);
});
