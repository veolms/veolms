import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isConnectFailure,
  isPlainRead,
  isReadCopyPreferred,
  withReadCopy,
} from "@veolms/database";
import Fastify from "fastify";

await test("plain SELECTs may use the copy; anything that writes or locks may not", () => {
  for (const sql of [
    'select "id" from "users" where "id" = $1',
    "  SELECT 1",
    "/* kysely */ select count(*) from courses",
    "with recent as (select * from orders) select * from recent",
    "show synchronous_standby_names",
  ]) {
    assert.equal(isPlainRead(sql), true, sql);
  }
  for (const sql of [
    'insert into "sessions" ("id") values ($1)',
    'update "sessions" set "last_used_at" = now()',
    "delete from jobs where id = $1",
    "begin",
    "select * from jobs for update skip locked",
    "select * from jobs for no key update",
    "select pg_advisory_xact_lock(1)",
    "select nextval('orders_seq')",
    "select pg_notify('veolms_cache', 'x')",
    "with moved as (delete from queue returning *) select * from moved",
    "set local synchronous_commit = local",
  ]) {
    assert.equal(isPlainRead(sql), false, sql);
  }
});

await test("only failures before anything ran are retried", () => {
  for (const error of [
    Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5000"), {
      code: "ECONNREFUSED",
    }),
    new Error("timeout exceeded when trying to connect"),
    new Error("Connection terminated unexpectedly"),
    Object.assign(new Error("the database system is starting up"), {
      code: "57P03",
    }),
    Object.assign(
      new Error("terminating connection due to administrator command"),
      { code: "57P01" },
    ),
  ]) {
    assert.equal(isConnectFailure(error), true, error.message);
  }
  for (const error of [
    Object.assign(new Error("duplicate key value"), { code: "23505" }),
    Object.assign(new Error("canceling statement due to statement timeout"), {
      code: "57014",
    }),
    Object.assign(
      new Error("cannot execute INSERT in a read-only transaction"),
      { code: "25006" },
    ),
    null,
  ]) {
    assert.equal(isConnectFailure(error), false, String(error?.message));
  }
});

await test("GET handlers see the read context, other methods and concurrent requests do not", async () => {
  const app = Fastify();
  // The same hook the API factory installs.
  app.addHook("onRequest", (request, _reply, done) => {
    if (
      (request.method === "GET" || request.method === "HEAD") &&
      request.headers["x-veolms-consistency"] !== "primary"
    ) {
      withReadCopy(done);
      return;
    }
    done();
  });
  const later = () => new Promise((resolve) => setTimeout(resolve, 20));
  app.get("/r", async () => {
    await later();
    return { read: isReadCopyPreferred() };
  });
  app.post("/w", async () => {
    await later();
    return { read: isReadCopyPreferred() };
  });
  const answers = await Promise.all([
    app.inject({ method: "GET", url: "/r" }),
    app.inject({ method: "POST", url: "/w" }),
    app.inject({
      method: "GET",
      url: "/r",
      headers: { "x-veolms-consistency": "primary" },
    }),
    app.inject({ method: "POST", url: "/w" }),
    app.inject({ method: "GET", url: "/r" }),
  ]);
  assert.deepEqual(
    answers.map((answer) => answer.json<{ read: boolean }>().read),
    [true, false, false, false, true],
  );
  assert.equal(isReadCopyPreferred(), false);
  await app.close();
});
