import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveBasicsCategoryUpdate } from "./basics-category.ts";

const LIVE = "11111111-1111-4111-8111-111111111111";
const OTHER = "44444444-4444-4444-8444-444444444444";

await test("no category field leaves the category as it is", () => {
  assert.equal(resolveBasicsCategoryUpdate({}), undefined);
  assert.equal(
    resolveBasicsCategoryUpdate({ categoryId: undefined, category: undefined }),
    undefined,
  );
});

await test("null in either field removes the category", () => {
  // The case that used to resolve to undefined and was skipped by the write.
  assert.equal(resolveBasicsCategoryUpdate({ categoryId: null }), null);
  assert.equal(resolveBasicsCategoryUpdate({ category: null }), null);
  assert.equal(
    resolveBasicsCategoryUpdate({ categoryId: null, category: null }),
    null,
  );
});

await test("a category id in either field sets it", () => {
  assert.equal(resolveBasicsCategoryUpdate({ categoryId: LIVE }), LIVE);
  assert.equal(resolveBasicsCategoryUpdate({ category: LIVE }), LIVE);
});

await test("a named category wins over a null in the other field", () => {
  assert.equal(
    resolveBasicsCategoryUpdate({ categoryId: null, category: LIVE }),
    LIVE,
  );
  assert.equal(
    resolveBasicsCategoryUpdate({ categoryId: LIVE, category: null }),
    LIVE,
  );
});

await test("categoryId wins when both fields name a category", () => {
  assert.equal(
    resolveBasicsCategoryUpdate({ categoryId: LIVE, category: OTHER }),
    LIVE,
  );
});
