// Run: node --test apps/web/src/lib/edgeCachedApi.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { SHARED_EDGE_COPY_MS, edgeCacheKey } from "./edgeCachedApi.ts";

const signedOut = { signedIn: false };

test("only GETs of the paths the CDN keeps get a key", () => {
  assert.equal(edgeCacheKey("GET", "/courses/js/curriculum", signedOut), null);
  assert.equal(edgeCacheKey("GET", "/courses/js", signedOut), null);
  assert.equal(edgeCacheKey("GET", "/platform/settings", signedOut), null);
  assert.equal(edgeCacheKey("POST", "/courses", signedOut), null);
  assert.notEqual(edgeCacheKey("GET", "/courses", signedOut), null);
  assert.notEqual(edgeCacheKey("get", "/courses?limit=60", signedOut), null);
  assert.notEqual(edgeCacheKey("GET", "/courses/js/overview", signedOut), null);
  assert.notEqual(
    edgeCacheKey("GET", "/platform/public-settings", signedOut),
    null,
  );
});

test("signed-out visitors share one key a minute", () => {
  const start = 1_800_000_000_000 - (1_800_000_000_000 % SHARED_EDGE_COPY_MS);
  const first = edgeCacheKey("GET", "/courses", {
    signedIn: false,
    now: start,
  });
  const later = edgeCacheKey("GET", "/courses", {
    signedIn: false,
    now: start + SHARED_EDGE_COPY_MS - 1,
  });
  const next = edgeCacheKey("GET", "/courses", {
    signedIn: false,
    now: start + SHARED_EDGE_COPY_MS,
  });
  assert.equal(first, later);
  assert.notEqual(first, next);
});

test("a signed-in reader never shares a key", () => {
  const now = 1_800_000_000_000;
  const keys = new Set(
    Array.from({ length: 50 }, () =>
      edgeCacheKey("GET", "/courses/js/overview", { signedIn: true, now }),
    ),
  );
  assert.equal(keys.size, 50);
});
