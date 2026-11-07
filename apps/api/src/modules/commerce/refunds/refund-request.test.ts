import assert from "node:assert/strict";
import { test } from "node:test";

import { refundReason, refundRequestKey } from "./refund-request.service.ts";

await test("a refund's reason is sent as it is when short enough", () => {
  assert.equal(refundReason("Not for me"), "Not for me");
});

await test("a long reason is cut to what a refund keeps and the gateway takes", () => {
  const cut = refundReason("x".repeat(1_000));

  assert.equal(cut.length, 480);
  assert.ok(cut.endsWith("…"));
});

await test("every try of one refund attempt shares a key, so a lost refund is resumed", () => {
  assert.equal(refundRequestKey("req-1", 0), refundRequestKey("req-1", 0));
});

await test("an attempt after a failed refund gets a new key, so it is not replayed", () => {
  assert.notEqual(refundRequestKey("req-1", 0), refundRequestKey("req-1", 1));
});
