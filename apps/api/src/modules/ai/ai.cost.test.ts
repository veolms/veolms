import assert from "node:assert/strict";
import { test } from "node:test";
import { estimateCostUsd } from "./ai.service.ts";

void test("cost is estimated from the model's list price", () => {
  const cost = estimateCostUsd("claude-opus-5-5", {
    inputTokens: 10_000,
    outputTokens: 8_000,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  });
  // 10k x $4/M + 8k x $20/M
  assert.equal(Number(cost.toFixed(4)), 0.2);
});

void test("cached input is far cheaper than fresh input", () => {
  const none = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
  const cached = estimateCostUsd("claude-opus-5-5", {
    ...none,
    cacheReadTokens: 10_000,
  });
  const fresh = estimateCostUsd("claude-opus-5-5", {
    ...none,
    inputTokens: 10_000,
  });
  assert.ok(cached < fresh / 10);
});
