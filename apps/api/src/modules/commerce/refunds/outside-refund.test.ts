import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isManualTransferProvider,
  outsideRefundId,
  refundChannelRefusal,
} from "./outside-refund.ts";

await test("only the manual provider counts as a manual transfer", () => {
  assert.equal(isManualTransferProvider("manual"), true);
  assert.equal(isManualTransferProvider("razorpay"), false);
  assert.equal(isManualTransferProvider("free"), false);
  assert.equal(isManualTransferProvider("Manual"), false);
});

await test("an outside refund id is the reference without spaces, in upper case", () => {
  assert.equal(outsideRefundId("utr 1234 ab"), "manual_refund_UTR1234AB");
  assert.equal(outsideRefundId("  UTR1234AB\t"), "manual_refund_UTR1234AB");
});

await test("the same reference typed differently gives the same id", () => {
  assert.equal(outsideRefundId("Utr-99 x"), outsideRefundId("UTR-99X"));
  assert.notEqual(outsideRefundId("UTR-99X"), outsideRefundId("UTR-99Y"));
});

await test("a blank reference gives no id", () => {
  assert.equal(outsideRefundId(""), null);
  assert.equal(outsideRefundId(" \n\t "), null);
});

await test("a manual payment is refused unless the refund is recorded as outside", () => {
  assert.match(
    refundChannelRefusal("manual", false) ?? "",
    /paid by manual transfer, so it cannot be refunded from here/,
  );
  assert.equal(refundChannelRefusal("manual", true), null);
});

await test("an outside refund is refused for a payment that came through a gateway", () => {
  assert.match(
    refundChannelRefusal("razorpay", true) ?? "",
    /was not paid by manual transfer/,
  );
  assert.equal(refundChannelRefusal("razorpay", false), null);
});
