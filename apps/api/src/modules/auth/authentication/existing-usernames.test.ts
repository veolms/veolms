import assert from "node:assert/strict";
import { test } from "node:test";

import { usernamesToLookUp } from "./authentication.service.ts";

void test("names are looked up lower-case, once each, and only usernames", () => {
  assert.deepEqual(
    usernamesToLookUp([" Atul", "atul", "x", "bad name!", "Shyam_246820"]),
    ["atul", "shyam_246820"],
  );
});

void test("at most 25 names are looked up", () => {
  const many = Array.from({ length: 40 }, (_, index) => `member${index}`);
  assert.equal(usernamesToLookUp(many).length, 25);
});
