import assert from "node:assert/strict";
import { test } from "node:test";

import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";

import {
  flushSessionTouches,
  touchSessionInBackground,
} from "./session.service.ts";

/** A transaction stand-in that records each `update sessions` statement. */
function fakeDatabase(fail = false) {
  const statements: { ids: unknown; at: unknown }[] = [];
  const database = {
    isTransaction: true,
    updateTable(table: string) {
      assert.equal(table, "sessions");
      let at: unknown;
      let ids: unknown;
      const chain = {
        set(values: { last_used_at: unknown }) {
          at = values.last_used_at;
          return chain;
        },
        where(column: string, _op: string, value: unknown) {
          if (column === "id") ids = value;
          return chain;
        },
        async execute() {
          if (fail) throw new Error("database unavailable");
          statements.push({ ids, at });
        },
      };
      return chain;
    },
  };
  return { database: database as unknown as Kysely<Database>, statements };
}

await test("a session is queued at most once per 15 minutes per process", async () => {
  const { database, statements } = fakeDatabase();
  const t0 = Date.parse("2026-11-05T18:00:00Z");
  assert.equal(touchSessionInBackground(database, "s-1", t0), true);
  assert.equal(touchSessionInBackground(database, "s-1", t0 + 60_000), false);
  assert.equal(
    touchSessionInBackground(database, "s-1", t0 + 14 * 60_000),
    false,
  );
  assert.equal(await flushSessionTouches(database), 1);
  assert.equal(
    touchSessionInBackground(database, "s-1", t0 + 15 * 60_000),
    true,
  );
  assert.equal(await flushSessionTouches(database), 1);
  assert.equal(statements.length, 2);
});

await test("many sessions are written in one statement", async () => {
  const { database, statements } = fakeDatabase();
  const t0 = Date.parse("2026-11-05T19:00:00Z");
  for (let i = 0; i < 500; i++)
    touchSessionInBackground(database, `b-${i}`, t0 + i);
  assert.equal(await flushSessionTouches(database), 500);
  assert.equal(statements.length, 1);
  assert.equal((statements[0]!.ids as string[]).length, 500);
  assert.deepEqual(statements[0]!.at, new Date(t0 + 499));
  assert.equal(await flushSessionTouches(database), 0);
});

await test("a failed batch never throws and the sessions are queued again later", async () => {
  const broken = fakeDatabase(true);
  const t0 = Date.parse("2026-11-05T20:00:00Z");
  touchSessionInBackground(broken.database, "f-1", t0);
  assert.equal(await flushSessionTouches(broken.database), 0);
  const { database, statements } = fakeDatabase();
  assert.equal(touchSessionInBackground(database, "f-1", t0 + 1_000), true);
  assert.equal(await flushSessionTouches(database), 1);
  assert.equal(statements.length, 1);
});
