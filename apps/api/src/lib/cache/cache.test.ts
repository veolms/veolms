import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { test } from "node:test";

import {
  ALL_CACHE_TAG,
  applyCacheInvalidation,
  cacheTags,
  clearAllCaches,
  configureCaches,
  createCache,
  getCacheStats,
  invalidateCache,
} from "@veolms/api-core";

const COURSE = "8F1C2A3B-4D5E-4F60-8A7B-9C0D1E2F3A4B";
const OTHER = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

let cacheNumber = 0;
/** A fresh cache per test: names must be unique in the process. */
function newCache<V>(options: { ttlMs?: number; maxBytes?: number } = {}) {
  cacheNumber += 1;
  return createCache<V>({
    name: `test.cache-${cacheNumber}`,
    ttlMs: options.ttlMs ?? 60_000,
    ...(options.maxBytes ? { maxBytes: options.maxBytes } : {}),
  });
}

/** A loader that counts its calls and returns `value`. */
function counted<V>(value: V) {
  const load = async () => {
    load.calls += 1;
    return value;
  };
  load.calls = 0;
  return load;
}

/** A load that waits until `release()`. */
function gated<V>(value: V) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const load = async () => {
    load.calls += 1;
    await gate;
    return value;
  };
  load.calls = 0;
  return { load, release };
}

await test("a fresh entry is served without loading again", async () => {
  const cache = newCache<string>();
  const load = counted("value");
  assert.equal(await cache.fetch("key", load), "value");
  assert.equal(await cache.fetch("key", load), "value");
  assert.equal(load.calls, 1);
  cache.dispose();
});

await test("callers asking while a key loads share the one load", async () => {
  const cache = newCache<string>();
  const { load, release } = gated("value");
  const reads = [cache.fetch("key", load), cache.fetch("key", load)];
  release();
  assert.deepEqual(await Promise.all(reads), ["value", "value"]);
  assert.equal(load.calls, 1);
  cache.dispose();
});

await test("null is a value like any other", async () => {
  const cache = newCache<string | null>();
  const load = counted(null);
  assert.equal(await cache.fetch("key", load), null);
  assert.equal(await cache.fetch("key", load), null);
  assert.equal(load.calls, 1);
  assert.deepEqual(cache.get("key"), { value: null });
  cache.dispose();
});

await test("an entry expires after its TTL", async () => {
  const cache = newCache<string>({ ttlMs: 20 });
  const load = counted("value");
  await cache.fetch("key", load);
  await sleep(40);
  await cache.fetch("key", load);
  assert.equal(load.calls, 2);
  cache.dispose();
});

await test("a TTL of 0 turns the cache off", async () => {
  const cache = newCache<string>({ ttlMs: 0 });
  const load = counted("value");
  await cache.fetch("key", load);
  await cache.fetch("key", load);
  cache.set("other", "value");
  assert.equal(load.calls, 2);
  assert.equal(cache.get("other"), undefined);
  cache.dispose();
});

await test("caching turned off everywhere loads every time and drops what was kept", async () => {
  const cache = newCache<string>();
  const load = counted("value");
  await cache.fetch("key", load);
  configureCaches({ enabled: false });
  try {
    await cache.fetch("key", load);
    await cache.fetch("key", load);
    assert.equal(load.calls, 3);
  } finally {
    configureCaches({ enabled: true });
  }
  await cache.fetch("key", load);
  assert.equal(load.calls, 4, "nothing kept from before it was turned off");
  cache.dispose();
});

await test("a failed load is not kept, and the next caller loads again", async () => {
  const cache = newCache<string>();
  let calls = 0;
  const failing = async (): Promise<string> => {
    calls += 1;
    throw new Error("not found");
  };
  await assert.rejects(cache.fetch("key", failing), /not found/);
  await assert.rejects(cache.fetch("key", failing), /not found/);
  assert.equal(calls, 2);
  assert.equal(cache.stats().loadFailures, 2);
  cache.dispose();
});

await test("invalidating a tag clears its entries in every cache, and nothing else", async () => {
  const lessons = newCache<string>();
  const pages = newCache<string>();
  const lessonLoad = counted("lessons");
  const pageLoad = counted("page");
  const otherLoad = counted("other");
  await lessons.fetch("a", lessonLoad, { tags: [cacheTags.course(COURSE)] });
  await pages.fetch("b", pageLoad, { tags: [cacheTags.course(COURSE)] });
  await pages.fetch("c", otherLoad, { tags: [cacheTags.course(OTHER)] });

  // Upper- and lower-case ids name the same course.
  invalidateCache([cacheTags.course(COURSE.toLowerCase())]);

  await lessons.fetch("a", lessonLoad, { tags: [cacheTags.course(COURSE)] });
  await pages.fetch("b", pageLoad, { tags: [cacheTags.course(COURSE)] });
  await pages.fetch("c", otherLoad, { tags: [cacheTags.course(OTHER)] });
  assert.deepEqual(
    [lessonLoad.calls, pageLoad.calls, otherLoad.calls],
    [2, 2, 1],
  );
  lessons.dispose();
  pages.dispose();
});

await test("the all tag and clearAllCaches empty every cache", async () => {
  const cache = newCache<string>();
  const load = counted("value");
  await cache.fetch("key", load, { tags: [cacheTags.site] });
  applyCacheInvalidation([ALL_CACHE_TAG]);
  await cache.fetch("key", load, { tags: [cacheTags.site] });
  clearAllCaches();
  await cache.fetch("key", load, { tags: [cacheTags.site] });
  assert.equal(load.calls, 3);
  cache.dispose();
});

await test("a load in progress when its tag is invalidated is returned but not kept", async () => {
  const cache = newCache<string>();
  const { load, release } = gated("old");
  const tags = [cacheTags.course(COURSE)];
  const inFlight = cache.fetch("key", load, { tags });

  invalidateCache(tags);
  // The next caller does not join the outdated load.
  const fresh = counted("new");
  const after = cache.fetch("key", fresh, { tags });

  release();
  assert.equal(await inFlight, "old");
  assert.equal(await after, "new");
  assert.equal(await cache.fetch("key", fresh, { tags }), "new");
  assert.equal(fresh.calls, 1);
  assert.equal(cache.stats().discardedLoads, 1);
  cache.dispose();
});

await test("a load whose tags come from its value is not kept after any invalidation meanwhile", async () => {
  const cache = newCache<{ courseId: string }>();
  const { load, release } = gated({ courseId: COURSE });
  const tagsOf = (value: { courseId: string }) => [
    cacheTags.course(value.courseId),
  ];
  const inFlight = cache.fetch("course-slug", load, { tagsOf });
  // Which course the slug names is not known yet, so this may be it.
  invalidateCache([cacheTags.course(OTHER)]);
  release();
  await inFlight;
  assert.equal(cache.get("course-slug"), undefined);

  // Once stored, the derived tag clears it like any other.
  const reload = counted({ courseId: COURSE });
  await cache.fetch("course-slug", reload, { tagsOf });
  invalidateCache([cacheTags.course(COURSE)]);
  assert.equal(cache.get("course-slug"), undefined);
  cache.dispose();
});

await test("an unrelated invalidation leaves a load with known tags alone", async () => {
  const cache = newCache<string>();
  const { load, release } = gated("value");
  const inFlight = cache.fetch("key", load, {
    tags: [cacheTags.course(COURSE)],
  });
  invalidateCache([cacheTags.course(OTHER)]);
  release();
  await inFlight;
  assert.deepEqual(cache.get("key"), { value: "value" });
  cache.dispose();
});

await test("the least recently used entries go first when the size budget is reached", async () => {
  // Each value is about 1 KB as JSON; the budget holds two.
  const cache = newCache<string>({ maxBytes: 4_500 });
  const big = (label: string) => counted(label.repeat(1000));
  const first = big("a");
  await cache.fetch("first", first);
  await cache.fetch("second", big("b"));
  await cache.fetch("first", first); // used, so "second" is now the oldest
  await cache.fetch("third", big("c"));

  assert.ok(cache.get("first"), "recently used entry kept");
  assert.equal(cache.get("second"), undefined, "least recently used evicted");
  assert.ok(cache.stats().evictions >= 1);
  assert.ok(cache.stats().bytes <= 4_500);
  cache.dispose();
});

await test("delete removes one entry and keeps a load in progress out of the cache", async () => {
  const cache = newCache<string>();
  await cache.fetch("key", counted("value"));
  cache.delete("key");
  assert.equal(cache.get("key"), undefined);

  const { load, release } = gated("value");
  const inFlight = cache.fetch("other", load);
  cache.delete("other");
  release();
  await inFlight;
  assert.equal(cache.get("other"), undefined);
  cache.dispose();
});

await test("caches are named, counted, and a name can be used once", async () => {
  const cache = newCache<string>();
  const load = counted("value");
  await cache.fetch("key", load);
  await cache.fetch("key", load);
  const stats = getCacheStats().find((entry) => entry.name === cache.name);
  assert.ok(stats);
  assert.equal(stats.entries, 1);
  assert.equal(stats.hits, 1);
  assert.equal(stats.misses, 1);
  assert.ok(stats.bytes > 0);

  assert.throws(
    () => createCache({ name: cache.name, ttlMs: 1_000 }),
    /already exists/,
  );
  cache.dispose();
  assert.equal(
    getCacheStats().some((entry) => entry.name === cache.name),
    false,
  );
});
