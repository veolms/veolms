import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createMasterManifestCache,
  isInlinableMasterManifest,
} from "./master-manifest-cache.ts";

const MASTER =
  "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=896000,RESOLUTION=640x360\n360p/360p.m3u8\n";

await test("a read master playlist is cached and served without storage", async () => {
  const cache = createMasterManifestCache();
  let reads = 0;
  const read = async () => {
    reads += 1;
    return MASTER;
  };

  assert.equal(
    await cache.resolve("protected/transcoded/a/master.m3u8", read),
    MASTER,
  );
  assert.equal(
    await cache.resolve("protected/transcoded/a/master.m3u8", read),
    MASTER,
  );
  assert.equal(reads, 1);
});

await test("a slow storage read gives up at the timeout and fills the cache later", async () => {
  const cache = createMasterManifestCache({ timeoutMs: 20 });
  let finish!: (text: string) => void;
  const slowRead = () =>
    new Promise<string>((settle) => {
      finish = settle;
    });

  const started = Date.now();
  assert.equal(await cache.resolve("k", slowRead), undefined);
  assert.ok(Date.now() - started < 1_000);

  finish(MASTER);
  await new Promise((settle) => setImmediate(settle));
  assert.equal(cache.get("k"), MASTER);
});

await test("a storage failure, a missing object or a non-playlist is not inlined", async () => {
  const cache = createMasterManifestCache();
  assert.equal(
    await cache.resolve("fails", async () => {
      throw new Error("S3 down");
    }),
    undefined,
  );
  assert.equal(await cache.resolve("missing", async () => null), undefined);
  assert.equal(
    await cache.resolve("html", async () => "<html>error</html>"),
    undefined,
  );
  assert.equal(cache.size(), 0);
});

await test("concurrent bootstraps share one storage read", async () => {
  const cache = createMasterManifestCache();
  let reads = 0;
  const read = async () => {
    reads += 1;
    await new Promise((settle) => setTimeout(settle, 5));
    return MASTER;
  };
  const results = await Promise.all([
    cache.resolve("k", read),
    cache.resolve("k", read),
    cache.resolve("k", read),
  ]);
  assert.deepEqual(results, [MASTER, MASTER, MASTER]);
  assert.equal(reads, 1);
});

await test("entries expire after the TTL and the oldest is evicted when full", async () => {
  let now = 1_000;
  const cache = createMasterManifestCache({
    maxEntries: 2,
    ttlMs: 100,
    now: () => now,
  });
  cache.set("a", MASTER);
  cache.set("b", MASTER);
  cache.set("c", MASTER);
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("b"), MASTER);
  assert.equal(cache.size(), 2);

  now += 101;
  assert.equal(cache.get("b"), undefined);
});

await test("by default an entry never expires", () => {
  let now = 1_000;
  const cache = createMasterManifestCache({ now: () => now });
  cache.set("a", MASTER);
  now += 365 * 24 * 60 * 60 * 1000;
  assert.equal(cache.get("a"), MASTER);
});

await test("a manifest that is read is not the one evicted", () => {
  const cache = createMasterManifestCache({ maxEntries: 2 });
  cache.set("a", MASTER);
  cache.set("b", MASTER);
  assert.equal(cache.get("a"), MASTER);
  cache.set("c", MASTER);
  assert.equal(cache.get("a"), MASTER);
  assert.equal(cache.get("b"), undefined);
});

await test("only an #EXTM3U playlist of a sane size is inlinable", () => {
  assert.equal(isInlinableMasterManifest(MASTER), true);
  assert.equal(isInlinableMasterManifest("  #EXTM3U\n"), true);
  assert.equal(isInlinableMasterManifest("#EXTINF"), false);
  assert.equal(
    isInlinableMasterManifest(`#EXTM3U\n${"x".repeat(70_000)}`),
    false,
  );
  assert.equal(isInlinableMasterManifest(undefined), false);
});

await test("a DASH MPD is inlinable too", () => {
  assert.equal(
    isInlinableMasterManifest(
      '<?xml version="1.0" encoding="UTF-8"?>\n<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static">\n<Period/></MPD>',
    ),
    true,
  );
  assert.equal(isInlinableMasterManifest("<MPD>"), true);
  assert.equal(isInlinableMasterManifest("<html><MPD>"), false);
});
