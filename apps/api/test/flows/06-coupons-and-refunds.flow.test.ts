/**
 * Coupons and refunds: what a coupon takes off the price the gateway
 * charges, which coupons the checkout refuses, and what a refund (asked for
 * by the learner and approved by staff, or made by staff) gives back and
 * takes away.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  signedInAdmin,
  signedUpLearner,
  startFlowApp,
} from "./setup/flow-app.ts";
import type { FlowClient } from "./setup/flow-app.ts";
import {
  courseAccess,
  createCourse,
  myCourseIds,
  play,
} from "./setup/flow-courses.ts";
import type { FlowCourse } from "./setup/flow-courses.ts";

const flow = await startFlowApp();
const admin = await signedInAdmin(flow);

const DAY = 24 * 60 * 60 * 1000;

interface CheckoutOrder {
  order: { id: string; status: string };
  gateway: {
    provider: string;
    gatewayOrderId: string;
    amount: number;
    currency: string;
  } | null;
}

let couponCounter = 0;

/** A coupon made in the admin area; open from yesterday for a month. */
async function createCoupon(
  options: {
    discountType: "percentage" | "fixed";
    discountValue: number;
    maxDiscountAmount?: number;
    startsAt?: Date;
    expiresAt?: Date;
    globalUsageLimit?: number;
    perUserLimit?: number;
    restrictedCourseIds?: string[];
  },
  code = `FLOW${process.pid}X${++couponCounter}`,
): Promise<string> {
  const response = await admin.post<{ code: string }>("/v1/coupons", {
    code,
    ...options,
    startsAt: (options.startsAt ?? new Date(Date.now() - DAY)).toISOString(),
    expiresAt: (
      options.expiresAt ?? new Date(Date.now() + 30 * DAY)
    ).toISOString(),
  });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body.data!.code;
}

/** "Buy now", with a coupon code typed in. */
function checkout(client: FlowClient, course: FlowCourse, couponCode?: string) {
  return client.post<CheckoutOrder>("/v1/checkout/orders", {
    items: [{ itemType: "course", courseId: course.id }],
    ...(couponCode === undefined ? {} : { couponCode }),
  });
}

/** Opens the gateway's window and pays it, as `03-buying-a-course` does. */
async function buy(
  client: FlowClient,
  course: FlowCourse,
  couponCode?: string,
) {
  const started = await checkout(client, course, couponCode);
  assert.equal(started.status, 200, JSON.stringify(started.body));
  const order = started.body.data!;
  assert.ok(order.gateway, "a paid order opens the gateway");
  const paid = flow.gateway.pay(order.gateway.gatewayOrderId);
  const confirmed = await client.post("/v1/payments/verify", {
    orderId: order.order.id,
    gatewayOrderId: order.gateway.gatewayOrderId,
    ...paid,
  });
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
  return {
    orderId: order.order.id,
    amount: order.gateway.amount,
    gatewayPaymentId: paid.gatewayPaymentId,
  };
}

/** The learner's "Request a refund" on their purchase history. */
function requestRefund(client: FlowClient, orderId: string) {
  return client.post<{ id: string; status: string }>(
    `/v1/orders/${orderId}/refund-requests`,
    { reason: "The course was not what I expected." },
  );
}

/** Staff approving or rejecting a learner's refund request. */
function reviewRefund(
  requestId: string,
  action: "approve" | "reject",
  extra: { preserveAccess?: boolean } = {},
) {
  return admin.post<{ status: string }>(
    `/v1/refund-requests/${requestId}/review`,
    { action, ...extra },
  );
}

async function orderStatus(orderId: string) {
  const order = await flow.database
    .selectFrom("orders")
    .select("status")
    .where("id", "=", orderId)
    .executeTakeFirstOrThrow();
  return order.status;
}

// ---------------------------------------------------------------- coupons

await test("a percentage coupon takes its share off what the gateway charges, in paise", async () => {
  const course = await createCourse(flow, { price: 1_299 });
  const code = await createCoupon({
    discountType: "percentage",
    discountValue: 25,
  });
  const { client } = await signedUpLearner(flow);

  const bought = await buy(client, course, code);

  // 25% of ₹1,299 is ₹324.75; the discount is whole rupees, rounded down.
  assert.equal(bought.amount, 97_500);
  assert.equal(flow.gateway.orders.at(-1)?.amount, 97_500);
  assert.equal((await play(client, course, 2)).status, 200);
});

await test("a fixed coupon takes its rupees off what the gateway charges, whatever case the code is typed in", async () => {
  const course = await createCourse(flow, { price: 1_299 });
  const code = await createCoupon({
    discountType: "fixed",
    discountValue: 200,
  });
  const { client } = await signedUpLearner(flow);

  const bought = await buy(client, course, code.toLowerCase());

  assert.equal(bought.amount, 109_900);
});

await test("a percentage coupon's discount stops at its cap", async () => {
  const course = await createCourse(flow, { price: 1_299 });
  const code = await createCoupon({
    discountType: "percentage",
    discountValue: 50,
    maxDiscountAmount: 300,
  });
  const { client } = await signedUpLearner(flow);

  const bought = await buy(client, course, code);

  assert.equal(bought.amount, 99_900);
});

await test("a 100% coupon enrols the learner without opening the gateway", async () => {
  const course = await createCourse(flow, { price: 1_299 });
  const code = await createCoupon({
    discountType: "percentage",
    discountValue: 100,
  });
  const { client } = await signedUpLearner(flow);
  const ordersBefore = flow.gateway.orders.length;

  const response = await checkout(client, course, code);

  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.data?.gateway, null);
  assert.equal(response.body.data?.order.status, "paid");
  assert.equal(flow.gateway.orders.length, ordersBefore, "nothing was charged");
  assert.equal((await courseAccess(client, course)).access?.enrolled, true);
  assert.equal((await play(client, course, 2)).status, 200);
});

await test("a coupon code that does not exist is refused", async () => {
  const course = await createCourse(flow);
  const { client } = await signedUpLearner(flow);

  const response = await checkout(client, course, "NO-SUCH-CODE");

  assert.equal(response.status, 400);
  assert.equal(response.body.error?.code, "INVALID_COUPON");
});

await test("an expired coupon is refused and no payment is opened", async () => {
  const course = await createCourse(flow);
  const code = await createCoupon({
    discountType: "percentage",
    discountValue: 20,
    startsAt: new Date(Date.now() - 10 * DAY),
    expiresAt: new Date(Date.now() - DAY),
  });
  const { client } = await signedUpLearner(flow);
  const ordersBefore = flow.gateway.orders.length;

  const response = await checkout(client, course, code);

  assert.equal(response.status, 400);
  assert.equal(response.body.error?.code, "COUPON_EXPIRED");
  assert.equal(flow.gateway.orders.length, ordersBefore);
});

await test("a coupon used up to its limit is refused to the next learner", async () => {
  const course = await createCourse(flow);
  const code = await createCoupon({
    discountType: "percentage",
    discountValue: 20,
    globalUsageLimit: 1,
  });
  const { client: first } = await signedUpLearner(flow);
  const { client: second } = await signedUpLearner(flow);
  await buy(first, course, code);

  const response = await checkout(second, course, code);

  assert.equal(response.status, 400);
  assert.equal(response.body.error?.code, "COUPON_USAGE_LIMIT_REACHED");
});

await test("an unpaid checkout holds the last use of a coupon", async () => {
  const course = await createCourse(flow);
  const code = await createCoupon({
    discountType: "percentage",
    discountValue: 20,
    globalUsageLimit: 1,
  });
  const { client: first } = await signedUpLearner(flow);
  const { client: second } = await signedUpLearner(flow);
  const held = await checkout(first, course, code);
  assert.equal(held.status, 200, JSON.stringify(held.body));

  const response = await checkout(second, course, code);

  assert.equal(response.status, 400);
  assert.equal(response.body.error?.code, "COUPON_USAGE_LIMIT_REACHED");
});

await test("a learner uses a coupon only as many times as it allows each learner", async () => {
  const course = await createCourse(flow);
  const another = await createCourse(flow);
  const code = await createCoupon({
    discountType: "fixed",
    discountValue: 100,
  });
  const { client } = await signedUpLearner(flow);
  await buy(client, course, code);

  const response = await checkout(client, another, code);

  assert.equal(response.status, 400);
  assert.equal(response.body.error?.code, "COUPON_USER_LIMIT_REACHED");
});

await test("a coupon limited to another course is refused", async () => {
  const course = await createCourse(flow);
  const another = await createCourse(flow);
  const code = await createCoupon({
    discountType: "percentage",
    discountValue: 20,
    restrictedCourseIds: [another.id],
  });
  const { client } = await signedUpLearner(flow);

  const response = await checkout(client, course, code);

  assert.equal(response.status, 400);
  assert.equal(response.body.error?.code, "COUPON_NOT_APPLICABLE");
  // It still works on the course it was made for: 20% of ₹499 is ₹99.80,
  // so ₹99 off.
  assert.equal((await buy(client, another, code)).amount, 40_000);
});

// ---------------------------------------------------------------- refunds

await test("a refund staff approve returns the payment and takes the course away", async () => {
  const course = await createCourse(flow, { price: 1_299 });
  const { client } = await signedUpLearner(flow);
  const bought = await buy(client, course);
  assert.equal((await play(client, course, 2)).status, 200);

  const asked = await requestRefund(client, bought.orderId);
  assert.equal(asked.status, 201, JSON.stringify(asked.body));
  assert.equal(asked.body.data?.status, "pending");
  const approved = await reviewRefund(asked.body.data!.id, "approve");

  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  assert.equal(approved.body.data?.status, "approved");
  assert.deepEqual(
    flow.gateway.refundsOf(bought.gatewayPaymentId).map((r) => r.amount),
    [129_900],
  );
  assert.equal(await orderStatus(bought.orderId), "refunded");
  assert.equal((await play(client, course, 2)).status, 403);
  assert.equal((await courseAccess(client, course)).access?.enrolled, false);
  assert.ok(!(await myCourseIds(client)).includes(course.id));
});

await test("a coupon purchase is refunded what the learner paid, not the course's price", async () => {
  const course = await createCourse(flow, { price: 1_299 });
  const code = await createCoupon({
    discountType: "percentage",
    discountValue: 25,
  });
  const { client } = await signedUpLearner(flow);
  const bought = await buy(client, course, code);

  const refund = await admin.post<{ amount: number; status: string }>(
    "/v1/refunds",
    { orderId: bought.orderId },
  );

  assert.equal(refund.status, 200, JSON.stringify(refund.body));
  assert.equal(refund.body.data?.amount, 97_500);
  assert.equal(refund.body.data?.status, "processed");
  assert.deepEqual(
    flow.gateway.refundsOf(bought.gatewayPaymentId).map((r) => r.amount),
    [97_500],
  );
});

await test("a learner cannot ask for a refund of someone else's order", async () => {
  const course = await createCourse(flow);
  const { client: buyer } = await signedUpLearner(flow);
  const { client: stranger } = await signedUpLearner(flow);
  const bought = await buy(buyer, course);

  const response = await requestRefund(stranger, bought.orderId);

  assert.equal(response.status, 404);
  assert.equal(response.body.error?.code, "ORDER_NOT_FOUND");
  // Nothing was filed in the buyer's name: they can still ask themselves.
  assert.equal((await requestRefund(buyer, bought.orderId)).status, 201);
});

await test("a learner cannot refund an order through the staff refund", async () => {
  const course = await createCourse(flow);
  const { client } = await signedUpLearner(flow);
  const bought = await buy(client, course);

  const response = await client.post("/v1/refunds", {
    orderId: bought.orderId,
  });

  assert.equal(response.status, 403);
  assert.deepEqual(flow.gateway.refundsOf(bought.gatewayPaymentId), []);
  assert.equal((await play(client, course, 2)).status, 200);
});

await test("a learner asks for a refund of an order once", async () => {
  const course = await createCourse(flow);
  const { client } = await signedUpLearner(flow);
  const bought = await buy(client, course);
  assert.equal((await requestRefund(client, bought.orderId)).status, 201);

  const again = await requestRefund(client, bought.orderId);

  assert.equal(again.status, 409);
  assert.equal(again.body.error?.code, "REFUND_REQUEST_ALREADY_EXISTS");
});

await test("an order that was never paid cannot be submitted for a refund", async () => {
  const course = await createCourse(flow);
  const { client } = await signedUpLearner(flow);
  const started = await checkout(client, course);
  assert.equal(started.status, 200);

  const response = await requestRefund(client, started.body.data!.order.id);

  assert.equal(response.status, 400);
  assert.equal(response.body.error?.code, "REFUND_REQUEST_NOT_ALLOWED");
});

await test("a rejected refund request leaves the course with the learner and cannot be reviewed again", async () => {
  const course = await createCourse(flow);
  const { client } = await signedUpLearner(flow);
  const bought = await buy(client, course);
  const asked = await requestRefund(client, bought.orderId);

  const rejected = await reviewRefund(asked.body.data!.id, "reject");

  assert.equal(rejected.status, 200, JSON.stringify(rejected.body));
  assert.equal(rejected.body.data?.status, "rejected");
  assert.deepEqual(flow.gateway.refundsOf(bought.gatewayPaymentId), []);
  assert.equal(await orderStatus(bought.orderId), "paid");
  assert.equal((await play(client, course, 2)).status, 200);

  const approvedLater = await reviewRefund(asked.body.data!.id, "approve");
  assert.equal(approvedLater.status, 400);
  assert.equal(
    approvedLater.body.error?.code,
    "REFUND_REQUEST_ALREADY_RESOLVED",
  );
  assert.deepEqual(flow.gateway.refundsOf(bought.gatewayPaymentId), []);
});

await test("staff can approve a refund and leave the course with the learner", async () => {
  const course = await createCourse(flow);
  const { client } = await signedUpLearner(flow);
  const bought = await buy(client, course);
  const asked = await requestRefund(client, bought.orderId);

  const approved = await reviewRefund(asked.body.data!.id, "approve", {
    preserveAccess: true,
  });

  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  assert.equal(await orderStatus(bought.orderId), "refunded");
  assert.equal((await play(client, course, 2)).status, 200);
});

await test("a partial refund keeps the course, and refunding the rest takes it away", async () => {
  const course = await createCourse(flow, { price: 1_299 });
  const { client } = await signedUpLearner(flow);
  const bought = await buy(client, course);

  const part = await admin.post<{ amount: number }>("/v1/refunds", {
    orderId: bought.orderId,
    amount: 50_000,
  });
  assert.equal(part.status, 200, JSON.stringify(part.body));
  assert.equal(await orderStatus(bought.orderId), "partially_refunded");
  assert.equal((await play(client, course, 2)).status, 200);

  // ₹799 is left of the ₹1,299 paid; asking for more is refused.
  const tooMuch = await admin.post("/v1/refunds", {
    orderId: bought.orderId,
    amount: 80_000,
  });
  assert.equal(tooMuch.status, 400);
  assert.equal(tooMuch.body.error?.code, "REFUND_NOT_ALLOWED");

  const rest = await admin.post<{ amount: number }>("/v1/refunds", {
    orderId: bought.orderId,
  });
  assert.equal(rest.status, 200, JSON.stringify(rest.body));
  assert.equal(rest.body.data?.amount, 79_900);
  assert.deepEqual(
    flow.gateway.refundsOf(bought.gatewayPaymentId).map((r) => r.amount),
    [50_000, 79_900],
  );
  assert.equal(await orderStatus(bought.orderId), "refunded");
  assert.equal((await play(client, course, 2)).status, 403);

  const again = await admin.post("/v1/refunds", { orderId: bought.orderId });
  assert.equal(again.status, 400);
  assert.equal(again.body.error?.code, "REFUND_NOT_ALLOWED");
});

await test("an order a 100% coupon paid for has nothing to refund", async () => {
  const course = await createCourse(flow);
  const code = await createCoupon({
    discountType: "percentage",
    discountValue: 100,
  });
  const { client } = await signedUpLearner(flow);
  const free = await checkout(client, course, code);
  assert.equal(free.body.data?.order.status, "paid");

  const refund = await admin.post("/v1/refunds", {
    orderId: free.body.data!.order.id,
  });

  assert.equal(refund.status, 400);
  assert.equal(refund.body.error?.code, "REFUND_NOT_ALLOWED");
  assert.equal((await play(client, course, 2)).status, 200);
});

await flow.close();
