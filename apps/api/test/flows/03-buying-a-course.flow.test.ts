/**
 * Buying a paid course: the checkout, the gateway's window (played by the
 * fake gateway), the browser confirming the payment and the gateway's own
 * webhook, and what each one must and must not unlock.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { signedUpLearner, startFlowApp } from "./setup/flow-app.ts";
import type { FlowClient } from "./setup/flow-app.ts";
import {
  courseAccess,
  createCourse,
  myCourseIds,
  play,
} from "./setup/flow-courses.ts";
import type { FlowCourse } from "./setup/flow-courses.ts";

const flow = await startFlowApp();

interface CheckoutOrder {
  order: { id: string; status: string };
  gateway: {
    provider: string;
    gatewayOrderId: string;
    amount: number;
    currency: string;
  } | null;
}

/** "Buy now": the order the checkout opens the gateway's window with. */
async function startCheckout(client: FlowClient, course: FlowCourse) {
  const response = await client.post<CheckoutOrder>("/v1/checkout/orders", {
    items: [{ itemType: "course", courseId: course.id }],
  });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.ok(response.body.data?.gateway, "a paid course opens the gateway");
  return response.body.data as CheckoutOrder & {
    gateway: NonNullable<CheckoutOrder["gateway"]>;
  };
}

/** The web app reporting what the gateway's window handed back. */
function confirmPayment(
  client: FlowClient,
  checkout: CheckoutOrder,
  paid: { gatewayPaymentId: string; gatewaySignature?: string },
) {
  return client.post<{ verified: boolean; orderStatus: string }>(
    "/v1/payments/verify",
    {
      orderId: checkout.order.id,
      gatewayOrderId: checkout.gateway!.gatewayOrderId,
      ...paid,
    },
  );
}

/** The gateway calling the webhook, signed as it signs its deliveries. */
function deliverWebhook(event: string, gatewayPaymentId: string) {
  const body = JSON.stringify({ event, gatewayPaymentId });
  return flow.visitor().request("POST", "/v1/webhooks/razorpay", body, {
    "x-razorpay-signature": flow.gateway.webhookSignatureFor(body),
    "x-razorpay-event-id": `evt_${gatewayPaymentId}_${event}`,
  });
}

async function waitFor(check: () => Promise<boolean>, what: string) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.fail(`timed out waiting until ${what}`);
}

async function enrollmentsOf(userId: string, courseId: string) {
  return flow.database
    .selectFrom("enrollments")
    .select(["status", "source"])
    .where("user_id", "=", userId)
    .where("course_id", "=", courseId)
    .execute();
}

await test("the checkout charges the course's price, in paise", async () => {
  const course = await createCourse(flow, { pricing: "paid", price: 1_299 });
  const { client } = await signedUpLearner(flow);

  const checkout = await startCheckout(client, course);

  assert.equal(checkout.order.status, "pending");
  assert.equal(checkout.gateway.amount, 129_900);
  assert.equal(checkout.gateway.currency, "INR");
});

await test("paying for a course enrolls the buyer and unlocks every lesson", async () => {
  const course = await createCourse(flow, { pricing: "paid" });
  const { client, userId } = await signedUpLearner(flow);
  assert.equal((await play(client, course, 2)).status, 403);

  const checkout = await startCheckout(client, course);
  const paid = flow.gateway.pay(checkout.gateway.gatewayOrderId);
  const confirmed = await confirmPayment(client, checkout, paid);

  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
  assert.equal(confirmed.body.data?.verified, true);
  assert.equal(confirmed.body.data?.orderStatus, "paid");

  const { access } = await courseAccess(client, course);
  assert.equal(access?.enrolled, true);
  assert.equal(access?.access, "full");
  assert.ok((await myCourseIds(client)).includes(course.id));
  for (const lesson of [1, 2, 3]) {
    assert.equal((await play(client, course, lesson)).status, 200);
  }
  assert.equal((await enrollmentsOf(userId, course.id)).length, 1);
});

await test("a forged payment signature is refused and unlocks nothing", async () => {
  const course = await createCourse(flow, { pricing: "paid" });
  const { client } = await signedUpLearner(flow);
  const checkout = await startCheckout(client, course);
  const paid = flow.gateway.pay(checkout.gateway.gatewayOrderId);

  const forged = await confirmPayment(client, checkout, {
    gatewayPaymentId: paid.gatewayPaymentId,
    gatewaySignature: "0".repeat(paid.gatewaySignature.length),
  });

  assert.equal(forged.status, 400);
  assert.equal((await courseAccess(client, course)).access?.enrolled, false);
  assert.equal((await play(client, course, 2)).status, 403);
});

await test("a payment that was never made cannot be claimed with someone else's payment id", async () => {
  const course = await createCourse(flow, { pricing: "paid" });
  const { client: buyer } = await signedUpLearner(flow);
  const { client: freeloader } = await signedUpLearner(flow);

  const bought = await startCheckout(buyer, course);
  const paid = flow.gateway.pay(bought.gateway.gatewayOrderId);
  assert.equal((await confirmPayment(buyer, bought, paid)).status, 200);

  // The freeloader opens a checkout of their own and reports the buyer's
  // payment (and its genuine signature) as theirs.
  const own = await startCheckout(freeloader, course);
  const claimed = await confirmPayment(freeloader, own, paid);

  assert.equal(claimed.status, 400);
  assert.equal(claimed.body.error?.code, "PAYMENT_SIGNATURE_INVALID");
  assert.equal((await play(freeloader, course, 2)).status, 403);
});

await test("confirming the same payment twice gives one enrolment, not two", async () => {
  const course = await createCourse(flow, { pricing: "paid" });
  const { client, userId } = await signedUpLearner(flow);
  const checkout = await startCheckout(client, course);
  const paid = flow.gateway.pay(checkout.gateway.gatewayOrderId);

  const first = await confirmPayment(client, checkout, paid);
  const second = await confirmPayment(client, checkout, paid);

  assert.equal(first.status, 200);
  assert.equal(second.status, 200, "a repeat is answered as already done");
  assert.equal((await enrollmentsOf(userId, course.id)).length, 1);
});

await test("the gateway's webhook alone enrolls the buyer when their browser closed before confirming", async () => {
  const course = await createCourse(flow, { pricing: "paid" });
  const { client } = await signedUpLearner(flow);
  const checkout = await startCheckout(client, course);
  const paid = flow.gateway.pay(checkout.gateway.gatewayOrderId);

  const delivered = await deliverWebhook(
    "payment.captured",
    paid.gatewayPaymentId,
  );
  assert.equal(delivered.status, 200);

  await waitFor(
    async () => (await play(client, course, 2)).status === 200,
    "the webhook's payment unlocks the course",
  );
  assert.equal((await courseAccess(client, course)).access?.enrolled, true);
});

await test("a webhook whose signature does not match is refused and unlocks nothing", async () => {
  const course = await createCourse(flow, { pricing: "paid" });
  const { client } = await signedUpLearner(flow);
  const checkout = await startCheckout(client, course);
  const paid = flow.gateway.pay(checkout.gateway.gatewayOrderId);

  const body = JSON.stringify({
    event: "payment.captured",
    gatewayPaymentId: paid.gatewayPaymentId,
  });
  const forged = await flow
    .visitor()
    .request("POST", "/v1/webhooks/razorpay", body, {
      "x-razorpay-signature": "f".repeat(64),
      "x-razorpay-event-id": `evt_forged_${paid.gatewayPaymentId}`,
    });

  assert.equal(forged.status, 400);
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.equal((await play(client, course, 2)).status, 403);
});

await test("a declined payment enrolls nobody, and the course can still be bought", async () => {
  const course = await createCourse(flow, { pricing: "paid" });
  const { client } = await signedUpLearner(flow);
  const checkout = await startCheckout(client, course);
  const declined = flow.gateway.decline(checkout.gateway.gatewayOrderId);

  const delivered = await deliverWebhook(
    "payment.failed",
    declined.gatewayPaymentId,
  );
  assert.equal(delivered.status, 200);
  await new Promise((resolve) => setTimeout(resolve, 500));

  assert.equal((await play(client, course, 2)).status, 403);
  assert.equal((await courseAccess(client, course)).access?.enrolled, false);

  // The learner tries again with another card, in the same window.
  const retried = flow.gateway.pay(checkout.gateway.gatewayOrderId);
  assert.equal((await confirmPayment(client, checkout, retried)).status, 200);
  assert.equal((await play(client, course, 2)).status, 200);
});

await test("a learner who already owns a course is not charged for it again", async () => {
  const course = await createCourse(flow, { pricing: "paid" });
  const { client } = await signedUpLearner(flow);
  const checkout = await startCheckout(client, course);
  const paid = flow.gateway.pay(checkout.gateway.gatewayOrderId);
  assert.equal((await confirmPayment(client, checkout, paid)).status, 200);
  const ordersBefore = flow.gateway.orders.length;

  const again = await client.post<CheckoutOrder>("/v1/checkout/orders", {
    items: [{ itemType: "course", courseId: course.id }],
  });

  assert.equal(again.status, 409);
  assert.equal(again.body.error?.code, "COURSE_ALREADY_OWNED");
  assert.equal(
    flow.gateway.orders.length,
    ordersBefore,
    "no second gateway order was opened",
  );
});

await test("a visitor who is not signed in cannot start a checkout", async () => {
  const course = await createCourse(flow, { pricing: "paid" });
  const response = await flow.visitor().post("/v1/checkout/orders", {
    items: [{ itemType: "course", courseId: course.id }],
  });
  assert.equal(response.status, 401);
});

await flow.close();
