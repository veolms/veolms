import assert from "node:assert/strict";
import { test } from "node:test";

import { needsRefundEntrySchema } from "@veolms/contracts";

import { describeSurplusCapture } from "../payments/surplus-payment.ts";
import {
  compareNewestFirst,
  isCourseDuplicateStillOwed,
  isDuplicateStillOwed,
  toCursorTime,
  toDuplicateBundlePurchaseEntry,
  toDuplicatePurchaseEntry,
  toNeedsRefundBuyer,
  toStuckManualTransferEntry,
  toSurplusPaymentEntry,
  withoutCoursesOfDuplicateBundles,
} from "./needs-refund.mapper.ts";
import type {
  DuplicateBundlePurchaseRow,
  DuplicatePurchaseRow,
  StuckManualTransferRow,
  SurplusPaymentToReturnRow,
} from "./needs-refund.repository.ts";

const buyer = {
  display_name: "Asha Rao",
  username: "asha",
  email: "asha@example.test",
};

const surplusRow: SurplusPaymentToReturnRow = {
  id: "11111111-1111-4111-8111-111111111111",
  order_id: "22222222-2222-4222-8222-222222222222",
  order_number: "ORD-20261013-AB12CD",
  user_id: "33333333-3333-4333-8333-333333333333",
  amount: 49900,
  currency: "INR",
  gateway_provider: "razorpay",
  gateway_payment_id: "pay_late_1",
  error_description: describeSurplusCapture("ORD-20261013-AB12CD"),
  item_titles: "Node.js, TypeScript",
  paid_at: new Date("2026-10-13T08:00:00.000Z"),
  paid_at_cursor: "2026-10-13T08:00:00.000000Z",
};

const duplicateRow: DuplicatePurchaseRow = {
  id: "44444444-4444-4444-8444-444444444444",
  order_item_id: "44444444-4444-4444-8444-444444444444",
  course_id: "55555555-5555-4555-8555-555555555555",
  title_snapshot: "Node.js",
  bundle_title: null,
  earlier_bundle_title: null,
  order_level_refunded_amount: "10000",
  user_id: "33333333-3333-4333-8333-333333333333",
  currency: "INR",
  order_id: "66666666-6666-4666-8666-666666666666",
  order_number: "ORD-20261013-LATER1",
  final_amount: 60000,
  total_amount: 85000,
  paid_at: new Date("2026-10-13T09:00:00.000Z"),
  paid_at_cursor: "2026-10-13T09:00:00.000000Z",
  earlier_order_id: "77777777-7777-4777-8777-777777777777",
  earlier_order_number: "ORD-20261013-EARLY1",
  earlier_final_amount: 49900,
  earlier_paid_at: new Date("2026-10-13T08:30:00.000Z"),
  refunded_amount: "10000",
  gateway_provider: "razorpay",
  gateway_payment_id: "pay_second_1",
};

/** The later order holds the course inside a bundle it paid 900 for. */
const courseInBundleRow: DuplicatePurchaseRow = {
  ...duplicateRow,
  // The record of the bundle item granting the course, not the item.
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  order_item_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  bundle_title: "Backend pack",
  final_amount: 90000,
  total_amount: 90000,
  refunded_amount: "0",
  order_level_refunded_amount: "0",
};

const duplicateBundleRow: DuplicateBundlePurchaseRow = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  bundle_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  title_snapshot: "Backend pack",
  user_id: "33333333-3333-4333-8333-333333333333",
  currency: "INR",
  order_id: "66666666-6666-4666-8666-666666666666",
  order_number: "ORD-20261013-LATER1",
  final_amount: 90000,
  total_amount: 115000,
  paid_at: new Date("2026-10-13T09:30:00.000Z"),
  paid_at_cursor: "2026-10-13T09:30:00.000000Z",
  earlier_order_id: "77777777-7777-4777-8777-777777777777",
  earlier_order_number: "ORD-20261013-EARLY1",
  earlier_final_amount: 100000,
  earlier_paid_at: new Date("2026-10-13T08:30:00.000Z"),
  refunded_amount: "0",
  gateway_provider: "razorpay",
  gateway_payment_id: "pay_bundle_2",
};

const transferRow: StuckManualTransferRow = {
  id: "88888888-8888-4888-8888-888888888888",
  order_id: "99999999-9999-4999-8999-999999999999",
  order_number: "ORD-20261013-PAID01",
  order_status: "paid",
  user_id: "33333333-3333-4333-8333-333333333333",
  total_amount: 49900,
  currency: "INR",
  payment_method: "bank_transfer",
  transaction_reference: "utr 4411 9020",
  item_titles: "Node.js",
  submitted_at: new Date("2026-10-13T07:45:00.000Z"),
  paid_at_cursor: "2026-10-13T07:45:00.000000Z",
};

await test("a surplus payment keeps its minor-unit amount and reads its refunds from the note", () => {
  const untouched = toSurplusPaymentEntry(surplusRow, buyer);
  assert.equal(untouched.kind, "surplus_payment");
  assert.equal(untouched.amount, 49900);
  assert.equal(untouched.refundedAmount, 0);
  assert.equal(untouched.courseTitle, "Node.js, TypeScript");
  assert.deepEqual(untouched.order, {
    id: surplusRow.order_id,
    orderNumber: "ORD-20261013-AB12CD",
  });
  assert.equal(untouched.gatewayPaymentId, "pay_late_1");

  const partReturned = toSurplusPaymentEntry(
    {
      ...surplusRow,
      error_description: `${surplusRow.error_description} Refund rfnd_1 of 10000 INR (minor units) reported by the gateway. Refund rfnd_2 of 5000 INR (minor units) reported by the gateway.`,
    },
    buyer,
  );
  assert.equal(partReturned.refundedAmount, 15000);
});

await test("a surplus payment never reports more returned than was taken", () => {
  const entry = toSurplusPaymentEntry(
    {
      ...surplusRow,
      error_description:
        "Refund rfnd_1 of 49900 INR (minor units) reported by the gateway. Refund rfnd_2 of 100 INR (minor units) reported by the gateway.",
    },
    buyer,
  );
  assert.equal(entry.refundedAmount, 49900);
});

await test("a duplicate purchase carries order, item and refund amounts in minor units, as stored", () => {
  const entry = toDuplicatePurchaseEntry(duplicateRow, buyer);
  assert.equal(entry.kind, "duplicate_purchase");
  // ₹600 on the item, ₹850 on the order: minor units in storage.
  assert.equal(entry.amount, 60000);
  assert.equal(entry.orderTotalAmount, 85000);
  assert.equal(entry.earlierOrder.amount, 49900);
  assert.equal(entry.refundedAmount, 10000);
  assert.deepEqual(entry.order, {
    id: duplicateRow.order_id,
    orderNumber: "ORD-20261013-LATER1",
  });
  assert.equal(entry.earlierOrder.orderNumber, "ORD-20261013-EARLY1");
  assert.equal(entry.courseId, duplicateRow.course_id);
  // Bought as a course item in both orders: no bundle is named.
  assert.equal(entry.bundleTitle, null);
  assert.equal(entry.earlierOrder.bundleTitle, null);
});

await test("a course granted inside a bundle names the bundle and carries the bundle's price, on either side", () => {
  const later = toDuplicatePurchaseEntry(courseInBundleRow, buyer);
  assert.equal(later.kind, "duplicate_purchase");
  assert.equal(later.courseTitle, "Node.js");
  assert.equal(later.bundleTitle, "Backend pack");
  // The bundle item's price: one course of a bundle has none of its own.
  assert.equal(later.amount, 90000);
  assert.equal(later.id, courseInBundleRow.id);
  assert.equal(later.earlierOrder.bundleTitle, null);

  const earlier = toDuplicatePurchaseEntry(
    { ...duplicateRow, earlier_bundle_title: "Types pack" },
    buyer,
  );
  assert.equal(earlier.bundleTitle, null);
  assert.equal(earlier.earlierOrder.bundleTitle, "Types pack");
  assert.equal(earlier.amount, 60000);
});

await test("a bundle paid twice is one entry for the bundle, in minor units", () => {
  const entry = toDuplicateBundlePurchaseEntry(duplicateBundleRow, buyer);
  assert.equal(entry.kind, "duplicate_bundle_purchase");
  assert.equal(entry.id, duplicateBundleRow.id);
  assert.equal(entry.bundleTitle, "Backend pack");
  assert.equal(entry.bundleId, duplicateBundleRow.bundle_id);
  assert.equal(entry.amount, 90000);
  assert.equal(entry.orderTotalAmount, 115000);
  assert.equal(entry.earlierOrder.amount, 100000);
  assert.equal(entry.refundedAmount, 0);
  assert.deepEqual(entry.order, {
    id: duplicateBundleRow.order_id,
    orderNumber: "ORD-20261013-LATER1",
  });
  assert.equal(entry.earlierOrder.orderNumber, "ORD-20261013-EARLY1");
  assert.equal(entry.gatewayPaymentId, "pay_bundle_2");
  assert.equal("courseTitle" in entry, false);
});

await test("the courses of a bundle that is itself listed as paid twice are not listed again", () => {
  const otherCourseOfTheBundle = {
    ...courseInBundleRow,
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    course_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  };
  const rows = [duplicateRow, courseInBundleRow, otherCourseOfTheBundle];
  // Both bundle courses hang off the bundle item that is the duplicate.
  assert.deepEqual(
    withoutCoursesOfDuplicateBundles(rows, [duplicateBundleRow]).map(
      (row) => row.id,
    ),
    [duplicateRow.id],
  );
  // No bundle was paid twice: every course stays.
  assert.equal(withoutCoursesOfDuplicateBundles(rows, []).length, 3);
  // Another bundle item being a duplicate does not hide these.
  assert.equal(
    withoutCoursesOfDuplicateBundles(rows, [
      { id: "ffffffff-ffff-4fff-8fff-ffffffffffff" },
    ]).length,
    3,
  );
});

await test("a zero-decimal currency is not multiplied by 100", () => {
  const entry = toDuplicatePurchaseEntry(
    { ...duplicateRow, final_amount: 600, total_amount: 850, currency: "JPY" },
    buyer,
  );
  assert.equal(entry.amount, 600);
  assert.equal(entry.orderTotalAmount, 850);
});

await test("a reported transfer claims the order's total in minor units and keeps the reference as the buyer typed it", () => {
  const entry = toStuckManualTransferEntry(transferRow, buyer);
  assert.equal(entry.kind, "manual_transfer_for_paid_order");
  assert.equal("orderStatus" in entry, false);
  assert.equal(entry.id, transferRow.id);
  // ₹499 on the order: minor units in storage.
  assert.equal(entry.amount, 49900);
  assert.equal(entry.currency, "INR");
  assert.equal(entry.paymentMethod, "bank_transfer");
  assert.equal(entry.transactionReference, "utr 4411 9020");
  assert.equal(entry.courseTitle, "Node.js");
  assert.deepEqual(entry.order, {
    id: transferRow.order_id,
    orderNumber: "ORD-20261013-PAID01",
  });
  assert.equal(entry.submittedAt, transferRow.submitted_at);
  assert.deepEqual(entry.buyer, {
    name: "Asha Rao",
    email: "asha@example.test",
    username: "asha",
  });

  // Zero-decimal currency: 499 yen is stored, and sent, as 499.
  assert.equal(
    toStuckManualTransferEntry({
      ...transferRow,
      total_amount: 499,
      currency: "JPY",
    }).amount,
    499,
  );
});

await test("a reported transfer is the kind that says why it is stuck: paid another way, or closed unpaid", () => {
  for (const status of ["paid", "partially_refunded", "refunded"] as const) {
    assert.equal(
      toStuckManualTransferEntry({ ...transferRow, order_status: status }).kind,
      "manual_transfer_for_paid_order",
    );
  }
  for (const status of ["cancelled", "payment_failed"] as const) {
    const entry = toStuckManualTransferEntry(
      { ...transferRow, order_status: status },
      buyer,
    );
    assert.equal(entry.kind, "manual_transfer_for_closed_order");
    assert.equal("orderStatus" in entry && entry.orderStatus, status);
    // Otherwise the same request, told the same way.
    assert.equal(entry.id, transferRow.id);
    assert.equal(entry.amount, 49900);
    assert.equal(entry.transactionReference, "utr 4411 9020");
    assert.equal(entry.submittedAt, transferRow.submitted_at);
  }
});

await test("every kind satisfies the strict response contract once serialised", () => {
  for (const entry of [
    toSurplusPaymentEntry(surplusRow, buyer),
    toDuplicatePurchaseEntry(duplicateRow, buyer),
    toDuplicatePurchaseEntry(courseInBundleRow, buyer),
    toDuplicatePurchaseEntry(
      { ...duplicateRow, earlier_bundle_title: "Types pack" },
      buyer,
    ),
    toDuplicateBundlePurchaseEntry(duplicateBundleRow, buyer),
    toDuplicateBundlePurchaseEntry(
      {
        ...duplicateBundleRow,
        gateway_provider: null,
        gateway_payment_id: null,
      },
      undefined,
    ),
    toStuckManualTransferEntry(transferRow, buyer),
    toStuckManualTransferEntry(
      { ...transferRow, order_status: "cancelled" },
      buyer,
    ),
    toStuckManualTransferEntry(
      { ...transferRow, order_status: "payment_failed", item_titles: null },
      undefined,
    ),
    toStuckManualTransferEntry(
      { ...transferRow, item_titles: null },
      undefined,
    ),
    toSurplusPaymentEntry({ ...surplusRow, item_titles: null }, undefined),
    toDuplicatePurchaseEntry(
      { ...duplicateRow, gateway_provider: null, gateway_payment_id: null },
      undefined,
    ),
  ]) {
    const wire: unknown = JSON.parse(JSON.stringify(entry));
    assert.equal(needsRefundEntrySchema.safeParse(wire).success, true);
  }
});

await test("a buyer is named by display name, then username, and a missing account still has a name", () => {
  assert.deepEqual(toNeedsRefundBuyer(buyer), {
    name: "Asha Rao",
    email: "asha@example.test",
    username: "asha",
  });
  assert.equal(toNeedsRefundBuyer({ ...buyer, display_name: "" }).name, "asha");
  assert.deepEqual(toNeedsRefundBuyer(undefined), {
    name: "Student",
    email: null,
    username: null,
  });
});

await test("every kind sorts into one list by its own time: a transfer by when it was reported", () => {
  const closed = {
    ...transferRow,
    id: "88888888-8888-4888-8888-888888888889",
    order_status: "cancelled" as const,
  };
  const rows = [
    surplusRow,
    closed,
    transferRow,
    duplicateRow,
    duplicateBundleRow,
    courseInBundleRow,
  ];
  assert.deepEqual(
    [...rows].sort(compareNewestFirst).map((row) => row.id),
    // Paid 09:30; two paid 09:00 (higher id first); paid 08:00; two
    // reported 07:45 (higher id first).
    [
      duplicateBundleRow.id,
      courseInBundleRow.id,
      duplicateRow.id,
      surplusRow.id,
      closed.id,
      transferRow.id,
    ],
  );
});

await test("entries of both kinds sort newest first, ties broken by id", () => {
  const rows = [
    { paid_at_cursor: "2026-10-13T08:00:00.000001Z", id: "a" },
    { paid_at_cursor: "2026-10-13T09:00:00.000000Z", id: "b" },
    { paid_at_cursor: "2026-10-13T08:00:00.000001Z", id: "c" },
    { paid_at_cursor: "2026-10-13T08:00:00.000000Z", id: "d" },
  ];
  assert.deepEqual(
    [...rows].sort(compareNewestFirst).map((row) => row.id),
    ["b", "c", "a", "d"],
  );
  assert.equal(compareNewestFirst(rows[0]!, rows[0]!), 0);
});

await test("a duplicate is owed until the later order has been refunded the course's price", () => {
  const item = { final_amount: 49900, currency: "INR" };
  assert.equal(isDuplicateStillOwed({ ...item, refunded_amount: "0" }), true);
  // A smaller part refund: still listed, with what has gone back.
  assert.equal(
    isDuplicateStillOwed({ ...item, refunded_amount: "49899" }),
    true,
  );
  // 499 rupees back, by a part refund of an order that holds other items.
  assert.equal(
    isDuplicateStillOwed({ ...item, refunded_amount: "49900" }),
    false,
  );
  assert.equal(
    isDuplicateStillOwed({ ...item, refunded_amount: "74900" }),
    false,
  );
  // Zero-decimal currency: 499 yen is 499 minor units, not 49900.
  assert.equal(
    isDuplicateStillOwed({
      final_amount: 499,
      currency: "JPY",
      refunded_amount: "499",
    }),
    false,
  );
});

await test("a course inside a later bundle is owed until staff refund something on the order as a whole", () => {
  const inBundle = {
    final_amount: 90000,
    currency: "INR",
    bundle_title: "Backend pack",
  };
  assert.equal(
    isCourseDuplicateStillOwed({
      ...inBundle,
      refunded_amount: "0",
      order_level_refunded_amount: "0",
    }),
    true,
  );
  // Any amount staff chose to return for the course settles it: there is
  // no price for one course of a bundle to hold it against.
  assert.equal(
    isCourseDuplicateStillOwed({
      ...inBundle,
      refunded_amount: "20000",
      order_level_refunded_amount: "20000",
    }),
    false,
  );
  // A refund of some other item of the order is not about this course.
  assert.equal(
    isCourseDuplicateStillOwed({
      ...inBundle,
      refunded_amount: "25000",
      order_level_refunded_amount: "0",
    }),
    true,
  );
  // A course item keeps the rule it had: owed until its price is back.
  const asCourseItem = {
    final_amount: 49900,
    currency: "INR",
    bundle_title: null,
  };
  assert.equal(
    isCourseDuplicateStillOwed({
      ...asCourseItem,
      refunded_amount: "20000",
      order_level_refunded_amount: "20000",
    }),
    true,
  );
  assert.equal(
    isCourseDuplicateStillOwed({
      ...asCourseItem,
      refunded_amount: "49900",
      order_level_refunded_amount: "0",
    }),
    false,
  );
});

await test("a cursor time is padded to the six fractional digits the queries print", () => {
  assert.equal(
    toCursorTime("2026-10-13T00:14:07.436Z"),
    "2026-10-13T00:14:07.436000Z",
  );
  assert.equal(
    toCursorTime("2026-10-13T00:14:07.436123Z"),
    "2026-10-13T00:14:07.436123Z",
  );
  assert.equal(
    toCursorTime("2026-10-13T00:14:07Z"),
    "2026-10-13T00:14:07.000000Z",
  );
});
