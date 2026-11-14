// Run: node --test apps/web/src/chat/chatFormat.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { lastSeenLabel } from "./chatFormat.ts";

const NOW = new Date(2026, 10, 14, 18, 0);
const at = (month: number, day: number, year = 2026) =>
  new Date(year, month, day, 17, 42).toISOString();

await test("nothing to say without a time", () => {
  assert.equal(lastSeenLabel(null, NOW), "");
});

await test("today and yesterday are named", () => {
  assert.match(lastSeenLabel(at(10, 14), NOW), /^last seen today at /);
  assert.match(lastSeenLabel(at(10, 13), NOW), /^last seen yesterday at /);
});

await test("an earlier day this year leaves the year out", () => {
  const label = lastSeenLabel(at(10, 2), NOW);
  assert.match(label, /^last seen .+ at /);
  assert.doesNotMatch(label, /2026/);
});

await test("a day in an earlier year keeps the year", () => {
  assert.match(lastSeenLabel(at(11, 30, 2025), NOW), /2025/);
});
