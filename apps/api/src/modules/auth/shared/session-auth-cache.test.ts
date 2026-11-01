import assert from "node:assert/strict";
import { test } from "node:test";
import { clearAllCaches, invalidateCache, cacheTags } from "@veolms/api-core";

import type { AuthenticatedRequestContext } from "./auth.types.ts";
import {
  clearSessionAuthCache,
  evictCachedSession,
  evictCachedUserSessions,
  getAuthContext,
} from "./session-auth-cache.ts";

const IN_AN_HOUR = () => new Date(Date.now() + 3_600_000);

/** A sign-in: only the fields the cache itself reads are real. */
function context(
  userId: string,
  sessionId: string,
  displayName: string,
  expiresAt = IN_AN_HOUR(),
): AuthenticatedRequestContext {
  return {
    user: { id: userId, displayName },
    session: { id: sessionId, user_id: userId, expires_at: expiresAt },
  } as unknown as AuthenticatedRequestContext;
}

/** Reads `token`; `loads` counts how often the database would be asked. */
function reader(make: () => AuthenticatedRequestContext | null) {
  const read = (token: string) =>
    getAuthContext(token, async () => {
      read.loads += 1;
      return make();
    });
  read.loads = 0;
  return read;
}

await test("a session is read from the database once, then served from the cache", async () => {
  clearAllCaches();
  const read = reader(() => context("user-a", "s-a1", "Ann"));
  await read("token-a1");
  const again = await read("token-a1");
  assert.equal(read.loads, 1);
  assert.equal(again?.user.displayName, "Ann");
});

await test("a token that signs nobody in is not kept", async () => {
  clearAllCaches();
  const read = reader(() => null);
  assert.equal(await read("unknown"), null);
  assert.equal(await read("unknown"), null);
  assert.equal(read.loads, 2);
});

await test("a saved account change drops every cached session of that account, and only those", async () => {
  clearAllCaches();
  const ann = reader(() => context("user-a", "s-a1", "Ann"));
  const annElsewhere = reader(() => context("user-a", "s-a2", "Ann"));
  const bee = reader(() => context("user-b", "s-b1", "Bee"));
  await Promise.all([
    ann("token-a1"),
    annElsewhere("token-a2"),
    bee("token-b1"),
  ]);

  // What authentication.service.ts does after a profile write commits.
  evictCachedUserSessions("user-a");

  await Promise.all([
    ann("token-a1"),
    annElsewhere("token-a2"),
    bee("token-b1"),
  ]);
  assert.deepEqual([ann.loads, annElsewhere.loads, bee.loads], [2, 2, 1]);
});

await test("revoking one session drops only that session", async () => {
  clearAllCaches();
  const first = reader(() => context("user-a", "s-a1", "Ann"));
  const second = reader(() => context("user-a", "s-a2", "Ann"));
  await Promise.all([first("token-a1"), second("token-a2")]);
  evictCachedSession("s-a1");
  await Promise.all([first("token-a1"), second("token-a2")]);
  assert.deepEqual([first.loads, second.loads], [2, 1]);
});

await test("changed sign-in rules or edited roles drop every session", async () => {
  clearAllCaches();
  const read = reader(() => context("user-a", "s-a1", "Ann"));
  await read("token-a1");
  clearSessionAuthCache();
  await read("token-a1");
  invalidateCache([cacheTags.rbac]);
  await read("token-a1");
  assert.equal(read.loads, 3);
});

await test("a session past its expiry is never served from the cache", async (t) => {
  clearAllCaches();
  const expiresAt = new Date(Date.now() + 60_000);
  const read = reader(() => context("user-a", "s-a1", "Ann", expiresAt));
  assert.ok(await read("token-a1"));
  // A minute and a bit later the cached session has expired.
  t.mock.timers.enable({ apis: ["Date"], now: expiresAt.getTime() + 1 });
  const read2 = reader(() => null);
  assert.equal(await read2("token-a1"), null);
});
