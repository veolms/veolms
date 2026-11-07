import assert from "node:assert/strict";
import { test } from "node:test";

import { createUpdateCoalescer } from "./update-coalescer.ts";

const logger = { warn() {} };
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

await test("the first update goes out at once, a burst after it as one newest update", async () => {
  const coalescer = createUpdateCoalescer(logger);
  const sent: number[] = [];
  for (let version = 1; version <= 50; version += 1) {
    coalescer.submit("room:1", version, async () => {
      sent.push(version);
    });
  }
  assert.deepEqual(sent, [1]);
  await sleep(1_150);
  assert.deepEqual(sent, [1, 50]);
  coalescer.stop();
});

await test("an older version never replaces a newer one", async () => {
  const coalescer = createUpdateCoalescer(logger);
  const sent: number[] = [];
  coalescer.submit("room:2", 1, async () => void sent.push(1));
  coalescer.submit("room:2", 5, async () => void sent.push(5));
  coalescer.submit("room:2", 3, async () => void sent.push(3));
  await sleep(1_150);
  assert.deepEqual(sent, [1, 5]);
  coalescer.stop();
});

await test("different messages do not wait for each other", () => {
  const coalescer = createUpdateCoalescer(logger);
  const sent: string[] = [];
  coalescer.submit("a", 1, async () => void sent.push("a"));
  coalescer.submit("b", 1, async () => void sent.push("b"));
  assert.deepEqual(sent, ["a", "b"]);
  coalescer.stop();
});
