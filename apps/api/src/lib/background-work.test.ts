import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { test } from "node:test";

import {
  runBackgroundItem,
  runBackgroundPass,
  setBackgroundWorkHooks,
} from "@veolms/api-core";

await test("without hooks, passes and items simply run", async () => {
  setBackgroundWorkHooks({});
  assert.equal(await runBackgroundPass("job", async () => 1), 1);
  assert.equal(
    await runBackgroundItem("job", { table: "t", id: "1" }, async () => 2),
    2,
  );
});

await test("hooks wrap the work, and the work sees the state they set", async () => {
  const state = new AsyncLocalStorage<string>();
  const calls: string[] = [];
  setBackgroundWorkHooks({
    aroundPass: (job, run) => {
      calls.push(`pass:${job}`);
      return state.run("all", run);
    },
    aroundItem: (job, item, run) => {
      calls.push(`item:${job}:${item.table}:${item.id}`);
      return state.run(`owner-of-${item.id}`, run);
    },
  });
  try {
    const seen = await runBackgroundPass("outbox", async () => {
      const inPass = state.getStore();
      const inItem = await runBackgroundItem(
        "outbox",
        { table: "outbox_events", id: "e1" },
        async () => state.getStore(),
      );
      return { inPass, inItem, after: state.getStore() };
    });
    assert.deepEqual(seen, {
      inPass: "all",
      inItem: "owner-of-e1",
      after: "all",
    });
    assert.deepEqual(calls, ["pass:outbox", "item:outbox:outbox_events:e1"]);
  } finally {
    setBackgroundWorkHooks({});
  }
});

await test("a failure inside an item reaches the caller", async () => {
  setBackgroundWorkHooks({
    aroundItem: (_job, _item, run) => run(),
  });
  try {
    await assert.rejects(
      runBackgroundItem("job", { table: "t", id: "1" }, async () => {
        throw new Error("boom");
      }),
      /boom/,
    );
  } finally {
    setBackgroundWorkHooks({});
  }
});
