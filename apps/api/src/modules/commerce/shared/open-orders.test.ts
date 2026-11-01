import assert from "node:assert/strict";
import { test } from "node:test";
import { CHECKOUT_WINDOW_SECONDS } from "@veolms/contracts";

import {
  CHECKOUT_WINDOW_GRACE_SECONDS,
  GATEWAY_ORDER_PENDING_SECONDS,
  checkoutSecondsLeft,
  coverageCovers,
  coverageOf,
  coverageOverlaps,
  decideOpenOrders,
  isOrderOpen,
  manualPaymentBlockingSince,
  manualPaymentStillBlocks,
  sameItems,
  type OpenOrderFacts,
} from "./open-orders.ts";
import { CommerceErrors } from "./commerce.errors.ts";

const now = new Date("2026-10-14T10:00:00.000Z");
const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000);
const WINDOW = CHECKOUT_WINDOW_SECONDS + CHECKOUT_WINDOW_GRACE_SECONDS;

const paidOrder = {
  createdAt: ago(3000),
  totalAmount: 499,
  isOpen: true,
};

await test("an order is in checkout from the last hand-out until the window and its allowance have passed", () => {
  assert.equal(
    checkoutSecondsLeft({ ...paidOrder, handedOutAt: now }, now),
    WINDOW,
  );
  assert.equal(
    checkoutSecondsLeft({ ...paidOrder, handedOutAt: ago(WINDOW - 1) }, now),
    1,
  );
  assert.equal(
    checkoutSecondsLeft({ ...paidOrder, handedOutAt: ago(WINDOW) }, now),
    0,
  );
  assert.equal(
    checkoutSecondsLeft({ ...paidOrder, handedOutAt: ago(WINDOW + 500) }, now),
    0,
  );
});

await test("a closed order handed out a moment ago is still in checkout", () => {
  assert.equal(
    checkoutSecondsLeft(
      { ...paidOrder, isOpen: false, handedOutAt: ago(60) },
      now,
    ),
    WINDOW - 60,
  );
});

await test("an order with nothing to pay is never in checkout", () => {
  assert.equal(
    checkoutSecondsLeft(
      { createdAt: now, totalAmount: 0, isOpen: true, handedOutAt: now },
      now,
    ),
    0,
  );
});

await test("an order that never got a gateway order is in checkout only while it is being started", () => {
  const fresh = { totalAmount: 499, isOpen: true, handedOutAt: null };
  assert.equal(
    checkoutSecondsLeft({ ...fresh, createdAt: ago(5) }, now),
    GATEWAY_ORDER_PENDING_SECONDS - 5,
  );
  assert.equal(
    checkoutSecondsLeft(
      { ...fresh, createdAt: ago(GATEWAY_ORDER_PENDING_SECONDS) },
      now,
    ),
    0,
  );
  assert.equal(
    checkoutSecondsLeft({ ...fresh, createdAt: ago(5), isOpen: false }, now),
    0,
  );
});

const bundleCourses = [
  { bundle_id: "b1", course_id: "x" },
  { bundle_id: "b1", course_id: "y" },
  { bundle_id: "b2", course_id: "y" },
  { bundle_id: "b2", course_id: "z" },
];
const course = (id: string) => ({ itemType: "course", itemId: id });
const bundle = (id: string) => ({ itemType: "bundle", itemId: id });
const quiz = (id: string) => ({ itemType: "quiz", itemId: id });
const cover = (...items: Array<{ itemType: string; itemId: string }>) =>
  coverageOf(items, bundleCourses);

await test("a bundle covers the courses it holds now", () => {
  assert.deepEqual([...cover(bundle("b1")).courseIds].sort(), ["x", "y"]);
  assert.deepEqual([...cover(course("x"), quiz("q")).quizPricingIds], ["q"]);
});

await test("a course overlaps a bundle that holds it, either way round", () => {
  assert.equal(coverageOverlaps(cover(course("x")), cover(bundle("b1"))), true);
  assert.equal(coverageOverlaps(cover(bundle("b1")), cover(course("x"))), true);
  assert.equal(
    coverageOverlaps(cover(course("x")), cover(bundle("b2"))),
    false,
  );
});

await test("two bundles that share a course overlap", () => {
  assert.equal(
    coverageOverlaps(cover(bundle("b1")), cover(bundle("b2"))),
    true,
  );
});

await test("a cart overlaps an order for one of its courses", () => {
  assert.equal(
    coverageOverlaps(cover(course("x"), course("k")), cover(course("x"))),
    true,
  );
  assert.equal(
    coverageOverlaps(cover(course("k"), course("m")), cover(course("x"))),
    false,
  );
});

await test("a quiz pass and its course are different purchases", () => {
  assert.equal(coverageOverlaps(cover(quiz("x")), cover(course("x"))), false);
  assert.equal(coverageOverlaps(cover(quiz("q")), cover(quiz("q"))), true);
});

await test("a bundle with no courses left is still the same purchase as itself", () => {
  assert.equal(
    coverageOverlaps(cover(bundle("empty")), cover(bundle("empty"))),
    true,
  );
});

await test("item sets are compared without regard to order", () => {
  assert.equal(
    sameItems(
      cover(course("x"), bundle("b2")),
      cover(bundle("b2"), course("x")),
    ),
    true,
  );
  assert.equal(sameItems(cover(course("x")), cover(bundle("b1"))), false);
  assert.equal(
    sameItems(cover(course("x")), cover(course("x"), course("k"))),
    false,
  );
});

const facts = (over: Partial<OpenOrderFacts>): OpenOrderFacts => ({
  id: "o1",
  isOpen: true,
  sameItems: true,
  overlaps: true,
  // The helper's default order has the request's own items.
  coveredByRequest: true,
  sameTerms: true,
  manualPaymentPending: false,
  checkoutSecondsLeft: 0,
  ...over,
});

await test("with no other order a checkout proceeds", () => {
  assert.deepEqual(decideOpenOrders([]), {
    kind: "proceed",
    supersedeOrderIds: [],
  });
});

await test("an order for something else is left alone", () => {
  assert.deepEqual(
    decideOpenOrders([
      facts({ sameItems: false, overlaps: false, checkoutSecondsLeft: 500 }),
    ]),
    { kind: "proceed", supersedeOrderIds: [] },
  );
});

await test("the same items on the same terms continue the order, in checkout or not", () => {
  assert.deepEqual(decideOpenOrders([facts({ checkoutSecondsLeft: 500 })]), {
    kind: "proceed",
    resumeOrderId: "o1",
    supersedeOrderIds: [],
  });
});

await test("another amount is refused while the earlier order is in checkout", () => {
  assert.deepEqual(
    decideOpenOrders([facts({ sameTerms: false, checkoutSecondsLeft: 500 })]),
    { kind: "checkout_in_progress", orderId: "o1", secondsLeft: 500 },
  );
});

await test("another amount replaces the earlier order once its window has closed", () => {
  assert.deepEqual(decideOpenOrders([facts({ sameTerms: false })]), {
    kind: "proceed",
    supersedeOrderIds: ["o1"],
  });
});

await test("an overlapping order in checkout refuses a different set of items", () => {
  assert.deepEqual(
    decideOpenOrders([facts({ sameItems: false, checkoutSecondsLeft: 30 })]),
    { kind: "checkout_in_progress", orderId: "o1", secondsLeft: 30 },
  );
});

await test("an overlapping order out of checkout is replaced", () => {
  assert.deepEqual(decideOpenOrders([facts({ sameItems: false })]), {
    kind: "proceed",
    supersedeOrderIds: ["o1"],
  });
});

await test("a transfer waiting for staff refuses the checkout, and is said before a payment window", () => {
  assert.deepEqual(
    decideOpenOrders([
      facts({ id: "o2", sameTerms: false, checkoutSecondsLeft: 500 }),
      facts({
        id: "o3",
        sameItems: false,
        isOpen: false,
        manualPaymentPending: true,
      }),
    ]),
    { kind: "manual_payment_pending", orderId: "o3" },
  );
});

await test("an order with a transfer waiting for staff is not continued either", () => {
  assert.deepEqual(decideOpenOrders([facts({ manualPaymentPending: true })]), {
    kind: "manual_payment_pending",
    orderId: "o1",
  });
});

await test("an order past its deadline is never continued, and refuses while its window may be open", () => {
  assert.deepEqual(
    decideOpenOrders([facts({ isOpen: false, checkoutSecondsLeft: 90 })]),
    { kind: "checkout_in_progress", orderId: "o1", secondsLeft: 90 },
  );
  assert.deepEqual(decideOpenOrders([facts({ isOpen: false })]), {
    kind: "proceed",
    supersedeOrderIds: [],
  });
});

await test("only the newest matching order is continued; older ones are closed", () => {
  assert.deepEqual(
    decideOpenOrders([facts({ id: "new" }), facts({ id: "old" })]),
    { kind: "proceed", resumeOrderId: "new", supersedeOrderIds: ["old"] },
  );
});

await test("the longest wait is the one reported", () => {
  const decision = decideOpenOrders([
    facts({ id: "a", sameTerms: false, checkoutSecondsLeft: 30 }),
    facts({ id: "b", sameItems: false, checkoutSecondsLeft: 400 }),
  ]);
  assert.deepEqual(decision, {
    kind: "checkout_in_progress",
    orderId: "b",
    secondsLeft: 400,
  });
});

await test("only an unpaid order before its deadline is open", () => {
  const later = new Date(now.getTime() + 1000);
  assert.equal(
    isOrderOpen({ status: "pending", expires_at: later }, now),
    true,
  );
  assert.equal(
    isOrderOpen({ status: "pending", expires_at: later.toISOString() }, now),
    true,
  );
  assert.equal(isOrderOpen({ status: "pending", expires_at: now }, now), false);
  for (const status of ["expired", "cancelled", "paid", "payment_processing"]) {
    assert.equal(isOrderOpen({ status, expires_at: later }, now), false);
  }
});

await test("the refusals are 409s that say what to do", () => {
  const busy = CommerceErrors.CHECKOUT_IN_PROGRESS("Course X", 541);
  assert.equal(busy.statusCode, 409);
  assert.equal(busy.code, "CHECKOUT_IN_PROGRESS");
  assert.match(busy.message, /"Course X".*try again in 10 minutes/);
  assert.match(
    CommerceErrors.CHECKOUT_IN_PROGRESS("Course X", 20).message,
    /try again in 1 minute\./,
  );
  const transfer = CommerceErrors.MANUAL_PAYMENT_PENDING("Course X");
  assert.equal(transfer.statusCode, 409);
  assert.equal(transfer.code, "MANUAL_PAYMENT_PENDING");
  const owned = CommerceErrors.BUNDLE_CONTAINS_OWNED_COURSE("Pack", ["A", "B"]);
  assert.equal(owned.statusCode, 409);
  assert.match(owned.message, /"Pack" includes "A", "B"/);
});

await test("an order with nothing to pay is never refused for a checkout in progress", () => {
  assert.deepEqual(
    decideOpenOrders(
      [facts({ id: "busy", sameTerms: false, checkoutSecondsLeft: 500 })],
      { freeOrder: true },
    ),
    { kind: "proceed", supersedeOrderIds: ["busy"] },
  );
  // The same orders refuse a request that takes money.
  assert.equal(
    decideOpenOrders([
      facts({ id: "busy", sameTerms: false, checkoutSecondsLeft: 500 }),
    ]).kind,
    "checkout_in_progress",
  );
});

await test("an order with nothing to pay closes an order in checkout that it covers entirely", () => {
  assert.deepEqual(
    decideOpenOrders(
      [
        facts({
          id: "part",
          sameItems: false,
          coveredByRequest: true,
          checkoutSecondsLeft: 90,
        }),
      ],
      { freeOrder: true },
    ),
    { kind: "proceed", supersedeOrderIds: ["part"] },
  );
});

await test("an order with nothing to pay leaves alone an order that also sells something else", () => {
  // Open, in checkout or not: it stays payable for the rest.
  assert.deepEqual(
    decideOpenOrders(
      [
        facts({
          id: "bundle",
          sameItems: false,
          coveredByRequest: false,
          checkoutSecondsLeft: 90,
        }),
        facts({ id: "cart", sameItems: false, coveredByRequest: false }),
      ],
      { freeOrder: true },
    ),
    { kind: "proceed", supersedeOrderIds: [] },
  );
});

await test("an order with nothing to pay does not cancel a pending transfer for an order that also sells something else", () => {
  assert.deepEqual(
    decideOpenOrders(
      [
        // Free course A + paid course B, transfer waiting for staff.
        facts({
          id: "a-and-b",
          sameItems: false,
          coveredByRequest: false,
          manualPaymentPending: true,
        }),
        // Course A alone, transfer waiting for staff: nothing left to buy.
        facts({
          id: "a-alone",
          sameTerms: false,
          manualPaymentPending: true,
        }),
      ],
      { freeOrder: true },
    ),
    {
      kind: "proceed",
      supersedeOrderIds: [],
      cancelOrderIds: ["a-alone"],
    },
  );
  // With only the part-covered order there is nothing to cancel at all.
  assert.deepEqual(
    decideOpenOrders(
      [
        facts({
          id: "a-and-b",
          sameItems: false,
          coveredByRequest: false,
          manualPaymentPending: true,
        }),
      ],
      { freeOrder: true },
    ),
    { kind: "proceed", supersedeOrderIds: [] },
  );
});

await test("a request covers an order when it gives every course and quiz pass the order sells", () => {
  // The same course, and a course inside a bundle the request holds.
  assert.equal(coverageCovers(cover(course("x")), cover(course("x"))), true);
  assert.equal(coverageCovers(cover(bundle("b1")), cover(course("x"))), true);
  assert.equal(
    coverageCovers(cover(bundle("b1")), cover(course("x"), course("y"))),
    true,
  );
  // The order also sells something the request does not give.
  assert.equal(
    coverageCovers(cover(course("x")), cover(course("x"), course("k"))),
    false,
  );
  assert.equal(coverageCovers(cover(course("x")), cover(bundle("b1"))), false);
  assert.equal(
    coverageCovers(cover(course("x")), cover(course("x"), quiz("q"))),
    false,
  );
  assert.equal(
    coverageCovers(
      cover(course("x"), quiz("q")),
      cover(course("x"), quiz("q")),
    ),
    true,
  );
  // A quiz pass is not its course.
  assert.equal(coverageCovers(cover(course("x")), cover(quiz("x"))), false);
  // Nothing in common.
  assert.equal(coverageCovers(cover(course("k")), cover(course("x"))), false);
});

await test("an order that holds nothing is covered only by the same items", () => {
  assert.equal(
    coverageCovers(cover(bundle("empty")), cover(bundle("empty"))),
    true,
  );
  assert.equal(
    coverageCovers(cover(course("x")), cover(bundle("empty"))),
    false,
  );
});

await test("an order with nothing to pay goes through beside a pending transfer, whose order is cancelled", () => {
  assert.deepEqual(
    decideOpenOrders(
      [
        facts({ id: "transfer", sameTerms: false, manualPaymentPending: true }),
        facts({ id: "plain", sameTerms: false }),
        // Expired, and still waiting for staff: cancelled as well.
        facts({
          id: "old-transfer",
          sameTerms: false,
          isOpen: false,
          manualPaymentPending: true,
        }),
        // Expired with nothing waiting: already closed, left as it is.
        facts({ id: "expired", sameTerms: false, isOpen: false }),
      ],
      { freeOrder: true },
    ),
    {
      kind: "proceed",
      supersedeOrderIds: ["plain"],
      cancelOrderIds: ["transfer", "old-transfer"],
    },
  );
});

await test("an order with nothing to pay still continues the same unfinished order", () => {
  assert.deepEqual(
    decideOpenOrders([facts({ id: "same" })], { freeOrder: true }),
    {
      kind: "proceed",
      resumeOrderId: "same",
      supersedeOrderIds: [],
    },
  );
});

await test("an order with nothing to pay leaves orders for other things alone", () => {
  assert.deepEqual(
    decideOpenOrders(
      [
        facts({
          id: "other",
          sameItems: false,
          overlaps: false,
          checkoutSecondsLeft: 500,
          manualPaymentPending: true,
        }),
      ],
      { freeOrder: true },
    ),
    { kind: "proceed", supersedeOrderIds: [] },
  );
});

await test("a reported transfer keeps the gateway closed for the set number of days, then no longer", () => {
  const days = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
  assert.deepEqual(manualPaymentBlockingSince(now, 7), days(7));
  assert.equal(manualPaymentStillBlocks(now, now, 7), true);
  assert.equal(manualPaymentStillBlocks(days(6.9), now, 7), true);
  assert.equal(manualPaymentStillBlocks(days(7), now, 7), false);
  assert.equal(manualPaymentStillBlocks(days(8).toISOString(), now, 7), false);
  // A shorter setting lets go sooner.
  assert.equal(manualPaymentStillBlocks(days(2), now, 1), false);
});

await test("the new refusals say what happened in plain words", () => {
  const gone = CommerceErrors.COURSE_NOT_AVAILABLE();
  assert.equal(gone.statusCode, 409);
  assert.equal(gone.code, "COURSE_NOT_AVAILABLE");
  assert.equal(
    gone.message,
    "This course is no longer available for purchase.",
  );
  const bundle = CommerceErrors.BUNDLE_COURSE_NOT_AVAILABLE("Pack");
  assert.equal(bundle.code, "COURSE_NOT_AVAILABLE");
  assert.match(
    bundle.message,
    /Bundle "Pack" includes a course that is no longer available/,
  );
  const nothing = CommerceErrors.MANUAL_PAYMENT_NOT_PENDING();
  assert.equal(nothing.statusCode, 409);
  assert.equal(nothing.code, "MANUAL_PAYMENT_NOT_PENDING");
  const covered = CommerceErrors.MANUAL_PAYMENT_ALREADY_COVERED(["Course X"]);
  assert.equal(covered.statusCode, 409);
  assert.match(covered.message, /already has access to "Course X"/);
});
