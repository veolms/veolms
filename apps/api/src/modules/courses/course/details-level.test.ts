import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveDetailsLevelUpdate } from "./details-level.ts";

await test("no level sent leaves the stored level as it is", () => {
  assert.equal(resolveDetailsLevelUpdate(undefined), undefined);
});

await test("all_levels stores no level", () => {
  // The case that used to be skipped: 200, and the course kept its level.
  assert.equal(resolveDetailsLevelUpdate("all_levels"), null);
});

await test("a level is stored as sent", () => {
  assert.equal(resolveDetailsLevelUpdate("beginner"), "beginner");
  assert.equal(resolveDetailsLevelUpdate("intermediate"), "intermediate");
  assert.equal(resolveDetailsLevelUpdate("advanced"), "advanced");
});
