/**
 * One coupon, a different discount per course: HAPPYDIWALI takes 40% off one
 * course and its own 50% off every other. What the gateway charges for each
 * course and for both in one order, what the admin reads back, and the rules
 * the API refuses.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  signedInAdmin,
  signedUpLearner,
  startFlowApp,
} from "./setup/flow-app.ts";
import type { FlowClient } from "./setup/flow-app.ts";
import { createCourse, play } from "./setup/flow-courses.ts";
import type { FlowCourse } from "./setup/flow-courses.ts";

const flow = await startFlowApp();
const admin = await signedInAdmin(flow);

const DAY = 24 * 60 * 60 * 1000;
let couponCounter = 0;

interface CouponBody {
  id: string;
  code: string;
  discountRules: Array<{
    targetType: string;
    targetId: string;
    discountType: string;
    discountValue: number;
  }>;
}

function newCoupon(body: Record<string, unknown>) {
  return admin.post<CouponBody>("/v1/coupons", {
    code: `RATES${process.pid}X${++couponCounter}`,
    discountType: "percentage",
    discountValue: 50,
    perUserLimit: 5,
    startsAt: new Date(Date.now() - DAY).toISOString(),
    expiresAt: new Date(Date.now() + 30 * DAY).toISOString(),
    ...body,
  });
}

const percentOff = (course: FlowCourse, value: number) => ({
  targetType: "course",
  targetId: course.id,
  discountType: "percentage",
  discountValue: value,
});

/** Checks out and pays; returns what the gateway charged, in paise. */
async function buy(
  client: FlowClient,
  courses: FlowCourse[],
  couponCode: string,
): Promise<number> {
  const started = await client.post<{
    order: { id: string };
    gateway: { gatewayOrderId: string; amount: number } | null;
  }>("/v1/checkout/orders", {
    items: courses.map((course) => ({
      itemType: "course",
      courseId: course.id,
    })),
    couponCode,
  });
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
  return order.gateway.amount;
}

await test("one coupon takes a course's own rate off it and its default off the rest", async () => {
  const node = await createCourse(flow, { price: 1_000 });
  const javascript = await createCourse(flow, { price: 1_000 });
  const created = await newCoupon({ discountRules: [percentOff(node, 40)] });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const code = created.body.data!.code;

  const first = await signedUpLearner(flow);
  assert.equal(await buy(first.client, [node], code), 60_000);
  assert.equal((await play(first.client, node, 2)).status, 200);

  const second = await signedUpLearner(flow);
  assert.equal(await buy(second.client, [javascript], code), 50_000);
});

await test("both courses in one order each get their own rate", async () => {
  const node = await createCourse(flow, { price: 1_000 });
  const javascript = await createCourse(flow, { price: 1_000 });
  const created = await newCoupon({ discountRules: [percentOff(node, 40)] });
  const { client } = await signedUpLearner(flow);

  // ₹400 off Node.js and ₹500 off JavaScript: ₹1,100 to pay.
  assert.equal(
    await buy(client, [node, javascript], created.body.data!.code),
    110_000,
  );
});

await test("the admin reads a coupon's rates back and replaces them", async () => {
  const node = await createCourse(flow, { price: 1_000 });
  const typescript = await createCourse(flow, { price: 1_000 });
  const created = await newCoupon({ discountRules: [percentOff(node, 40)] });
  const id = created.body.data!.id;

  const read = await admin.get<CouponBody>(`/v1/coupons/${id}`);
  assert.equal(read.status, 200);
  assert.deepEqual(
    read.body.data!.discountRules.map((r) => [r.targetId, r.discountValue]),
    [[node.id, 40]],
  );

  const updated = await admin.patch<CouponBody>(`/v1/coupons/${id}`, {
    discountRules: [percentOff(typescript, 30)],
  });
  assert.equal(updated.status, 200, JSON.stringify(updated.body));
  assert.deepEqual(
    updated.body.data!.discountRules.map((r) => [r.targetId, r.discountValue]),
    [[typescript.id, 30]],
  );
});

await test("a rate for a course the coupon does not apply to is refused", async () => {
  const node = await createCourse(flow, { price: 1_000 });
  const other = await createCourse(flow, { price: 1_000 });

  const outside = await newCoupon({
    restrictedCourseIds: [node.id],
    discountRules: [percentOff(other, 40)],
  });
  assert.equal(outside.status, 400);
  assert.equal(outside.body.error?.code, "COUPON_RULE_OUT_OF_SCOPE");

  // Narrowing the courses may not leave a rate behind.
  const created = await newCoupon({ discountRules: [percentOff(other, 40)] });
  const narrowed = await admin.patch(`/v1/coupons/${created.body.data!.id}`, {
    restrictedCourseIds: [node.id],
  });
  assert.equal(narrowed.status, 400);
  assert.equal(narrowed.body.error?.code, "COUPON_RULE_OUT_OF_SCOPE");
});

await test("a percentage rate over 100% and two rates for one course are refused", async () => {
  const node = await createCourse(flow, { price: 1_000 });
  const over = await newCoupon({ discountRules: [percentOff(node, 101)] });
  assert.equal(over.status, 400);
  const twice = await newCoupon({
    discountRules: [percentOff(node, 40), percentOff(node, 30)],
  });
  assert.equal(twice.status, 400);
});

await flow.close();
