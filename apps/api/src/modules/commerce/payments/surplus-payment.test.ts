import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applySurplusRefund,
  describeSurplusCapture,
  isOrderAlreadyPaid,
  refundedSoFar,
} from "./surplus-payment.ts";

const captured = {
  amount: 49900,
  error_description: describeSurplusCapture("ORD-20261013-AB12CD"),
};

await test("an order counts as already paid once it has been paid, refunded or not", () => {
  assert.equal(isOrderAlreadyPaid("paid"), true);
  assert.equal(isOrderAlreadyPaid("partially_refunded"), true);
  assert.equal(isOrderAlreadyPaid("refunded"), true);
  assert.equal(isOrderAlreadyPaid("pending"), false);
  assert.equal(isOrderAlreadyPaid("payment_processing"), false);
  assert.equal(isOrderAlreadyPaid("expired"), false);
  assert.equal(isOrderAlreadyPaid("cancelled"), false);
  assert.equal(isOrderAlreadyPaid("payment_failed"), false);
});

await test("a refund of the whole amount closes a surplus payment", () => {
  const next = applySurplusRefund(captured, {
    gatewayRefundId: "rfnd_1",
    amount: 49900,
    currency: "INR",
  });
  assert.equal(next.status, "refunded");
  assert.match(next.errorDescription, /Refund rfnd_1 of 49900 INR/u);
  assert.ok(next.errorDescription.startsWith(captured.error_description));
});

await test("partial refunds add up, and the payment closes when they cover it", () => {
  const first = applySurplusRefund(captured, {
    gatewayRefundId: "rfnd_1",
    amount: 10000,
    currency: "INR",
  });
  assert.equal(first.status, "captured");

  const second = applySurplusRefund(
    { amount: 49900, error_description: first.errorDescription },
    { gatewayRefundId: "rfnd_2", amount: 39900, currency: "INR" },
  );
  assert.equal(second.status, "refunded");
  assert.match(second.errorDescription, /rfnd_1 of 10000/u);
  assert.match(second.errorDescription, /rfnd_2 of 39900/u);
});

await test("the same refund reported twice is counted once", () => {
  const first = applySurplusRefund(captured, {
    gatewayRefundId: "rfnd_1",
    amount: 30000,
    currency: "INR",
  });
  const again = applySurplusRefund(
    { amount: 49900, error_description: first.errorDescription },
    { gatewayRefundId: "rfnd_1", amount: 30000, currency: "INR" },
  );
  assert.equal(again.status, "captured");
  assert.equal(again.errorDescription, first.errorDescription);
});

await test("a refund id that only begins like an earlier one is a different refund", () => {
  const first = applySurplusRefund(captured, {
    gatewayRefundId: "rfnd_12",
    amount: 20000,
    currency: "INR",
  });
  const second = applySurplusRefund(
    { amount: 49900, error_description: first.errorDescription },
    { gatewayRefundId: "rfnd_1", amount: 29900, currency: "INR" },
  );
  assert.equal(second.status, "refunded");
});

await test("a surplus payment with no description yet still records its refund", () => {
  const next = applySurplusRefund(
    { amount: 49900, error_description: null },
    { gatewayRefundId: "rfnd_1", amount: 100, currency: "INR" },
  );
  assert.equal(next.status, "captured");
  assert.equal(
    next.errorDescription,
    "Refund rfnd_1 of 100 INR (minor units) reported by the gateway.",
  );
});

await test("the refunds noted on a surplus payment add up, and a payment with none has returned nothing", () => {
  assert.equal(refundedSoFar(null), 0);
  assert.equal(refundedSoFar(captured.error_description), 0);
  const once = applySurplusRefund(captured, {
    gatewayRefundId: "rfnd_a",
    amount: 10000,
    currency: "INR",
  });
  assert.equal(refundedSoFar(once.errorDescription), 10000);
  const twice = applySurplusRefund(
    { amount: 49900, error_description: once.errorDescription },
    { gatewayRefundId: "rfnd_b", amount: 2500, currency: "INR" },
  );
  assert.equal(refundedSoFar(twice.errorDescription), 12500);
});

await test("only a refund note counts as a refund, not other text that mentions one", () => {
  const description =
    describeSurplusCapture("ORD-20261013-AB12CD") +
    ' The buyer already had "Refund Policy of 49900 Rupees Explained".';
  assert.equal(refundedSoFar(description), 0);
  const next = applySurplusRefund(
    { amount: 49900, error_description: description },
    { gatewayRefundId: "rfnd_1", amount: 100, currency: "INR" },
  );
  assert.equal(next.status, "captured");
  assert.equal(refundedSoFar(next.errorDescription), 100);
});
