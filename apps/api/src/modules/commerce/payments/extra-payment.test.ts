import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AUTO_REFUND_RETRY_MIN_MS,
  autoRefundAttemptDue,
  autoRefundKey,
  classifyAutoRefundFailure,
  decideCapturedPayment,
  describeExtraCaptureForClosedOrder,
  describeExtraCaptureForHeldItems,
  heldItemTitles,
  isAutoRefundKey,
  isGatewayMoney,
  type SoldItem,
} from "./extra-payment.ts";
import { applySurplusRefund, refundedSoFar } from "./surplus-payment.ts";

const gateway = { gateway_provider: "razorpay", amount: 49900 };
const manual = { gateway_provider: "manual", amount: 49900 };
const free = { gateway_provider: "free", amount: 0 };

await test("only money that came through the gateway can go back through it", () => {
  assert.equal(isGatewayMoney(gateway), true);
  assert.equal(isGatewayMoney(manual), false);
  assert.equal(isGatewayMoney(free), false);
  assert.equal(
    isGatewayMoney({ gateway_provider: "razorpay", amount: 0 }),
    false,
  );
});

await test("the first payment of an order the buyer has nothing of is delivered", () => {
  for (const orderStatus of ["pending", "payment_processing"] as const) {
    assert.deepEqual(
      decideCapturedPayment({
        orderStatus,
        payment: gateway,
        heldTitles: [],
        autoRefund: true,
      }),
      { kind: "fulfil" },
    );
  }
});

await test("a late payment on an expired order is honoured when the buyer has nothing it sells", () => {
  assert.deepEqual(
    decideCapturedPayment({
      orderStatus: "expired",
      payment: gateway,
      heldTitles: [],
      autoRefund: true,
    }),
    { kind: "fulfil" },
  );
});

await test("a second gateway payment for a paid order is extra and is refunded", () => {
  for (const orderStatus of [
    "paid",
    "partially_refunded",
    "refunded",
  ] as const) {
    assert.deepEqual(
      decideCapturedPayment({
        orderStatus,
        payment: gateway,
        heldTitles: [],
        autoRefund: true,
      }),
      { kind: "extra", why: "order_already_paid", refund: true },
    );
  }
});

await test("a payment for something the buyer already has is extra and is refunded, whatever state the unpaid order is in", () => {
  for (const orderStatus of [
    "expired",
    "pending",
    "cancelled",
    "payment_failed",
  ] as const) {
    assert.deepEqual(
      decideCapturedPayment({
        orderStatus,
        payment: gateway,
        heldTitles: ["Course A"],
        autoRefund: true,
      }),
      { kind: "extra", why: "already_held", refund: true },
    );
  }
});

await test("with automatic refunds off, a late payment is honoured as before and a surplus is only listed", () => {
  assert.deepEqual(
    decideCapturedPayment({
      orderStatus: "expired",
      payment: gateway,
      heldTitles: ["Course A"],
      autoRefund: false,
    }),
    { kind: "fulfil" },
  );
  assert.deepEqual(
    decideCapturedPayment({
      orderStatus: "paid",
      payment: gateway,
      heldTitles: [],
      autoRefund: false,
    }),
    { kind: "extra", why: "order_already_paid", refund: false },
  );
});

await test("a manual transfer or a no-cost payment is never refunded by code", () => {
  assert.deepEqual(
    decideCapturedPayment({
      orderStatus: "paid",
      payment: manual,
      heldTitles: [],
      autoRefund: true,
    }),
    { kind: "extra", why: "order_already_paid", refund: false },
  );
  // What the buyer has does not make a no-cost order "extra".
  assert.deepEqual(
    decideCapturedPayment({
      orderStatus: "pending",
      payment: free,
      heldTitles: ["Course A"],
      autoRefund: true,
    }),
    { kind: "fulfil" },
  );
});

await test("money for a cancelled or failed order the buyer has nothing of is extra: refunded, or listed when automatic refunds are off", () => {
  for (const orderStatus of ["cancelled", "payment_failed"] as const) {
    assert.deepEqual(
      decideCapturedPayment({
        orderStatus,
        payment: gateway,
        heldTitles: [],
        autoRefund: true,
      }),
      { kind: "extra", why: "order_closed", refund: true },
    );
    // Never an error, and never delivered, with the switch off either.
    assert.deepEqual(
      decideCapturedPayment({
        orderStatus,
        payment: gateway,
        heldTitles: ["Course A"],
        autoRefund: false,
      }),
      { kind: "extra", why: "order_closed", refund: false },
    );
  }
});

await test("a cancelled order is not honoured the way an expired one is", () => {
  const late = { payment: gateway, heldTitles: [], autoRefund: true };
  assert.equal(
    decideCapturedPayment({ ...late, orderStatus: "expired" }).kind,
    "fulfil",
  );
  assert.equal(
    decideCapturedPayment({ ...late, orderStatus: "cancelled" }).kind,
    "extra",
  );
});

await test("a no-cost payment for a closed order moved no money and is left to the caller", () => {
  for (const orderStatus of ["cancelled", "payment_failed"] as const) {
    assert.deepEqual(
      decideCapturedPayment({
        orderStatus,
        payment: free,
        heldTitles: [],
        autoRefund: true,
      }),
      { kind: "not_fulfillable" },
    );
  }
});

await test("the note on money for a closed order says how the order was closed", () => {
  assert.match(
    describeExtraCaptureForClosedOrder("ORD-1", "cancelled"),
    /for order ORD-1 after it had been cancelled\. Nothing was granted/u,
  );
  assert.match(
    describeExtraCaptureForClosedOrder("ORD-1", "payment_failed"),
    /after it had been closed as failed\./u,
  );
  assert.equal(
    refundedSoFar(describeExtraCaptureForClosedOrder("ORD-1", "cancelled")),
    0,
  );
});

await test("a title that reads like a refund is not counted as one", () => {
  const sneaky = [
    "Refund Policy of 49900 Rupees Explained",
    // Word for word what a refund note says.
    "Refund rfnd_x of 49900 INR (minor units) reported by the gateway.",
  ];
  const description = describeExtraCaptureForHeldItems("ORD-1", sneaky);
  assert.match(description, /"Refund Policy of 49900 Rupees Explained"/u);
  assert.equal(refundedSoFar(description), 0);

  // A real refund of part of it is still read back, and only that.
  const partly = applySurplusRefund(
    { amount: 49900, error_description: description },
    { gatewayRefundId: "rfnd_1", amount: 10000, currency: "INR" },
  );
  assert.equal(partly.status, "captured");
  assert.equal(refundedSoFar(partly.errorDescription), 10000);
  // A refund whose id a title happens to name is still noted.
  const named = applySurplusRefund(
    { amount: 49900, error_description: description },
    { gatewayRefundId: "rfnd_x", amount: 49900, currency: "INR" },
  );
  assert.equal(named.status, "refunded");
});

const item = (over: Partial<SoldItem>): SoldItem => ({
  item_type: "course",
  course_id: null,
  bundle_id: null,
  quiz_pricing_id: null,
  title_snapshot: "?",
  ...over,
});
const none = {
  ownedCourseIds: new Set<string>(),
  bundleCourses: [],
  heldQuizPricingIds: new Set<string>(),
};

await test("a course the buyer has access to is held; one they do not have is not", () => {
  const items = [
    item({ course_id: "a", title_snapshot: "A" }),
    item({ course_id: "b", title_snapshot: "B" }),
  ];
  assert.deepEqual(heldItemTitles(items, none), []);
  assert.deepEqual(
    heldItemTitles(items, { ...none, ownedCourseIds: new Set(["b"]) }),
    ["B"],
  );
});

await test("a bundle is held as soon as the buyer has any one course in it", () => {
  const items = [
    item({ item_type: "bundle", bundle_id: "x", title_snapshot: "Bundle X" }),
  ];
  const bundleCourses = [
    { bundle_id: "x", course_id: "a" },
    { bundle_id: "x", course_id: "b" },
    { bundle_id: "y", course_id: "c" },
  ];
  assert.deepEqual(
    heldItemTitles(items, {
      ...none,
      bundleCourses,
      ownedCourseIds: new Set(["b"]),
    }),
    ["Bundle X"],
  );
  // A course of another bundle says nothing about this one.
  assert.deepEqual(
    heldItemTitles(items, {
      ...none,
      bundleCourses,
      ownedCourseIds: new Set(["c"]),
    }),
    [],
  );
});

await test("a quiz pass the buyer holds is held", () => {
  const items = [
    item({
      item_type: "quiz",
      quiz_pricing_id: "q",
      title_snapshot: "Quiz pass",
    }),
  ];
  assert.deepEqual(heldItemTitles(items, none), []);
  assert.deepEqual(
    heldItemTitles(items, { ...none, heldQuizPricingIds: new Set(["q"]) }),
    ["Quiz pass"],
  );
});

await test("one payment has one automatic refund key", () => {
  assert.equal(autoRefundKey("p1"), "auto-refund:p1");
  assert.equal(isAutoRefundKey(autoRefundKey("p1")), true);
  assert.equal(isAutoRefundKey("staff-key-1"), false);
  assert.equal(isAutoRefundKey(null), false);
});

await test("an automatic refund is tried at once, then after waits that grow", () => {
  const created = new Date("2026-10-14T10:00:00.000Z");
  const at = (ms: number) => new Date(created.getTime() + ms);
  const minute = 60 * 1000;

  // Never tried.
  assert.equal(
    autoRefundAttemptDue({ createdAt: created, lastTouchedAt: created }, at(1)),
    true,
  );
  // Tried a moment after it was reserved: the shortest wait applies.
  const first = { createdAt: created, lastTouchedAt: at(200) };
  assert.equal(autoRefundAttemptDue(first, at(minute)), false);
  assert.equal(
    autoRefundAttemptDue(first, at(200 + AUTO_REFUND_RETRY_MIN_MS)),
    true,
  );
  // Tried again an hour in: the next attempt is an hour after that.
  const later = { createdAt: created, lastTouchedAt: at(60 * minute) };
  assert.equal(autoRefundAttemptDue(later, at(90 * minute)), false);
  assert.equal(autoRefundAttemptDue(later, at(120 * minute)), true);
});

await test("a gateway that refuses for good ends an automatic refund; a rate limit or a credentials problem does not", () => {
  // The outcome is unknown: timeout, 5xx, 409, no status at all.
  for (const statusCode of [undefined, 500, 503, 408, 409]) {
    assert.equal(
      classifyAutoRefundFailure({ definitive: false, statusCode }),
      "retry",
    );
  }
  // Asked to slow down: nothing is wrong with the refund.
  assert.equal(
    classifyAutoRefundFailure({ definitive: true, statusCode: 429 }),
    "retry",
  );
  // Our keys were not accepted: tried again, and someone has to look.
  for (const statusCode of [401, 403]) {
    assert.equal(
      classifyAutoRefundFailure({ definitive: true, statusCode }),
      "retry_needs_operator",
    );
  }
  // The gateway looked at this refund and said no.
  for (const statusCode of [400, 404, 422]) {
    assert.equal(
      classifyAutoRefundFailure({ definitive: true, statusCode }),
      "refused",
    );
  }
});
