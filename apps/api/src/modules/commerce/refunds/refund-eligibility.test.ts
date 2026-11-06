import assert from "node:assert/strict";
import { test } from "node:test";

import {
  REFUND_REASON_MESSAGES,
  evaluateRefundEligibility,
  isRefundOffered,
} from "./refund-eligibility.ts";

const HOUR = 3600;
const DAY_MS = 24 * 60 * 60 * 1000;
const paidAt = new Date("2026-11-01T10:00:00Z");
const daysLater = (days: number) => new Date(paidAt.getTime() + days * DAY_MS);

await test("a purchase barely watched, within 30 days, is eligible", () => {
  assert.deepEqual(
    evaluateRefundEligibility({
      paidAt,
      now: daysLater(3),
      watchedSeconds: 2 * HOUR,
      courseSeconds: 50 * HOUR,
    }),
    { eligible: true, reasons: [] },
  );
});

await test("a 50-hour course allows 5 hours (10%)", () => {
  const at = (watchedSeconds: number) =>
    evaluateRefundEligibility({
      paidAt,
      now: daysLater(1),
      watchedSeconds,
      courseSeconds: 50 * HOUR,
    });

  assert.equal(at(5 * HOUR).eligible, true);
  assert.deepEqual(at(5 * HOUR + 60).reasons, ["watched_share"]);
});

await test("a 200-hour course allows 10 hours, not 20 (10%)", () => {
  const at = (watchedSeconds: number) =>
    evaluateRefundEligibility({
      paidAt,
      now: daysLater(1),
      watchedSeconds,
      courseSeconds: 200 * HOUR,
    });

  assert.equal(at(10 * HOUR).eligible, true);
  assert.deepEqual(at(10 * HOUR + 60).reasons, ["watched_hours"]);
});

await test("a 100-hour course, where both limits are 10 hours, names the 10%", () => {
  assert.deepEqual(
    evaluateRefundEligibility({
      paidAt,
      now: daysLater(1),
      watchedSeconds: 11 * HOUR,
      courseSeconds: 100 * HOUR,
    }).reasons,
    ["watched_share"],
  );
});

await test("a refund can be asked for up to 30 days after the purchase", () => {
  const on = (now: Date) =>
    evaluateRefundEligibility({
      paidAt,
      now,
      watchedSeconds: 0,
      courseSeconds: 50 * HOUR,
    });

  assert.equal(on(daysLater(30)).eligible, true);
  assert.deepEqual(on(new Date(daysLater(30).getTime() + 1000)).reasons, [
    "window_passed",
  ]);
});

await test("both reasons are given when both apply", () => {
  assert.deepEqual(
    evaluateRefundEligibility({
      paidAt,
      now: daysLater(45),
      watchedSeconds: 20 * HOUR,
      courseSeconds: 50 * HOUR,
    }),
    { eligible: false, reasons: ["watched_share", "window_passed"] },
  );
});

await test("a course with no video is judged on the 30 days alone", () => {
  assert.equal(
    evaluateRefundEligibility({
      paidAt,
      now: daysLater(2),
      watchedSeconds: 0,
      courseSeconds: 0,
    }).eligible,
    true,
  );
});

await test("a refund is offered on a paid purchase", () => {
  assert.equal(
    isRefundOffered({ status: "paid", totalAmount: 69_900, paidAt }),
    true,
  );
});

await test("a free enrollment is offered no refund", () => {
  assert.equal(
    isRefundOffered({ status: "paid", totalAmount: 0, paidAt }),
    false,
  );
});

await test("a failed, processing or refunded order is offered no refund", () => {
  for (const status of [
    "payment_failed",
    "payment_processing",
    "pending",
    "expired",
    "cancelled",
    "refunded",
    "partially_refunded",
  ] as const) {
    assert.equal(
      isRefundOffered({ status, totalAmount: 69_900, paidAt }),
      false,
      status,
    );
  }
});

await test("an order with no payment date is offered no refund", () => {
  assert.equal(
    isRefundOffered({ status: "paid", totalAmount: 69_900, paidAt: null }),
    false,
  );
});

await test("every reason has the message the student is shown", () => {
  assert.deepEqual(REFUND_REASON_MESSAGES, {
    watched_share: "You've completed more than 10% of this course.",
    watched_hours: "You've watched more than 10 hours of this course.",
    window_passed: "Refunds are only available within 30 days of purchase.",
  });
});
