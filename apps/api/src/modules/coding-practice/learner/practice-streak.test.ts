import assert from "node:assert/strict";
import { test } from "node:test";
import { streakOf } from "./learner.service.ts";

void test("a streak counts days in a row up to today or yesterday", () => {
  const days = [
    "2026-11-01",
    "2026-11-02",
    "2026-11-03",
    "2026-11-10",
    "2026-11-11",
  ];
  assert.deepEqual(streakOf(days, "2026-11-11"), { current: 2, best: 3 });
  assert.deepEqual(streakOf(days, "2026-11-12"), { current: 2, best: 3 });
  assert.deepEqual(streakOf(days, "2026-11-13"), { current: 0, best: 3 });
});

void test("no practice: no streak", () => {
  assert.deepEqual(streakOf([], "2026-11-11"), { current: 0, best: 0 });
});

void test("the same day twice and month ends do not break a streak", () => {
  assert.deepEqual(
    streakOf(["2026-10-31", "2026-11-01", "2026-11-01"], "2026-11-01"),
    { current: 2, best: 2 },
  );
});
