import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { test } from "node:test";

import {
  ALL_CACHE_TAG,
  cacheTags,
  createCache,
  invalidateCache,
  setCacheScope,
} from "@veolms/api-core";

const scope = new AsyncLocalStorage<string>();
const inScope = <T>(name: string, run: () => T): T => scope.run(name, run);

let cacheNumber = 0;
function newCache<V>() {
  cacheNumber += 1;
  return createCache<V>({ name: `test.scope-${cacheNumber}`, ttlMs: 60_000 });
}

function counted<V>(value: V) {
  const load = async () => {
    load.calls += 1;
    return value;
  };
  load.calls = 0;
  return load;
}

await test("without a scope source, caches behave exactly as before", async () => {
  setCacheScope(null);
  const cache = newCache<string>();
  const load = counted("value");
  await cache.fetch("k", load, { tags: [cacheTags.catalog] });
  await cache.fetch("k", load, { tags: [cacheTags.catalog] });
  assert.equal(load.calls, 1);
  invalidateCache([cacheTags.catalog]);
  await cache.fetch("k", load, { tags: [cacheTags.catalog] });
  assert.equal(load.calls, 2);
  cache.dispose();
});

await test("the same key in two scopes holds two separate values", async () => {
  setCacheScope(() => scope.getStore());
  try {
    const cache = newCache<string>();
    const a = await inScope("A", () => cache.fetch("all", async () => "A's"));
    const b = await inScope("B", () => cache.fetch("all", async () => "B's"));
    assert.equal(a, "A's");
    assert.equal(b, "B's");
    assert.deepEqual(
      inScope("A", () => cache.get("all")),
      { value: "A's" },
    );
    assert.equal(cache.get("all"), undefined, "nothing outside a scope");
    inScope("B", () => cache.set("x", "set in B"));
    assert.equal(
      inScope("A", () => cache.get("x")),
      undefined,
    );
    cache.dispose();
  } finally {
    setCacheScope(null);
  }
});

await test("an invalidation within a scope clears that scope's entries only", async () => {
  setCacheScope(() => scope.getStore());
  try {
    const cache = newCache<string>();
    const loadA = counted("A");
    const loadB = counted("B");
    const tags = [cacheTags.catalog];
    await inScope("A", () => cache.fetch("list", loadA, { tags }));
    await inScope("B", () => cache.fetch("list", loadB, { tags }));
    inScope("A", () => invalidateCache([cacheTags.catalog]));
    await inScope("A", () => cache.fetch("list", loadA, { tags }));
    await inScope("B", () => cache.fetch("list", loadB, { tags }));
    assert.equal(loadA.calls, 2, "A was cleared");
    assert.equal(loadB.calls, 1, "B was kept");

    inScope("B", () => invalidateCache([ALL_CACHE_TAG]));
    await inScope("A", () => cache.fetch("list", loadA, { tags }));
    await inScope("B", () => cache.fetch("list", loadB, { tags }));
    assert.equal(loadA.calls, 2, "B's 'everything' leaves A alone");
    assert.equal(loadB.calls, 2);
    cache.dispose();
  } finally {
    setCacheScope(null);
  }
});

await test("an invalidation outside any scope clears every scope", async () => {
  setCacheScope(() => scope.getStore());
  try {
    const cache = newCache<string>();
    const loadA = counted("A");
    const loadB = counted("B");
    const tagsOf = () => [cacheTags.course("C1")];
    await inScope("A", () => cache.fetch("c", loadA, { tagsOf }));
    await inScope("B", () => cache.fetch("c", loadB, { tagsOf }));
    invalidateCache([cacheTags.course("C1")]);
    await inScope("A", () => cache.fetch("c", loadA, { tagsOf }));
    await inScope("B", () => cache.fetch("c", loadB, { tagsOf }));
    assert.equal(loadA.calls, 2);
    assert.equal(loadB.calls, 2);
    cache.dispose();
  } finally {
    setCacheScope(null);
  }
});
