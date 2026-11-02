/**
 * Prices for buyers outside India: a course can have a dollar price beside
 * its rupee one. A buyer outside India (Cloudflare's country header) sees
 * and pays it, in cents; a buyer in India, or one whose country is not
 * known, pays rupees as before. Coupons set in rupees take off the same
 * share of a dollar price, and revenue counts a dollar sale in rupees at
 * the rate it settled at.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  signedInAdmin,
  signedUpLearner,
  startFlowApp,
} from "./setup/flow-app.ts";
import type { FlowClient } from "./setup/flow-app.ts";
import { createCourse, myCourseIds } from "./setup/flow-courses.ts";
import type { FlowCourse } from "./setup/flow-courses.ts";
import { FAKE_RUPEES_PER_UNIT } from "./setup/fake-payment-gateway.ts";

const flow = await startFlowApp();
const admin = await signedInAdmin(flow);

const DAY = 24 * 60 * 60 * 1000;
const FROM_JAPAN = { "cf-ipcountry": "JP" };
const FROM_INDIA = { "cf-ipcountry": "IN" };

interface CheckoutOrder {
  order: { id: string; status: string };
  gateway: { gatewayOrderId: string; amount: number; currency: string } | null;
}

interface Preview {
  pricing: {
    amountUnit?: "major" | "minor";
    subtotalAmount?: number;
    discountAmount: number;
    totalAmount: number;
    currency: string;
  };
  couponValidation?: { valid: boolean; message?: string };
}

/** A paid course at ₹3,499, with $64.99 marked and $43.99 for buyers abroad. */
async function dualPricedCourse(): Promise<FlowCourse> {
  const course = await createCourse(flow, { price: 3499 });
  const saved = await admin.request("PUT", `/v1/courses/${course.id}/pricing`, {
    price: 3499,
    salePrice: 3499,
    currency: "INR",
    international: {
      currency: "USD",
      priceMinor: 6499,
      salePriceMinor: 4399,
    },
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  return course;
}

function preview(
  client: FlowClient,
  course: FlowCourse,
  headers: Record<string, string>,
  couponCode?: string,
) {
  return client.request<Preview>(
    "POST",
    "/v1/checkout/preview",
    {
      items: [{ itemType: "course", courseId: course.id }],
      ...(couponCode ? { couponCode } : {}),
    },
    headers,
  );
}

function checkout(
  client: FlowClient,
  course: FlowCourse,
  headers: Record<string, string>,
  couponCode?: string,
) {
  return client.request<CheckoutOrder>(
    "POST",
    "/v1/checkout/orders",
    {
      items: [{ itemType: "course", courseId: course.id }],
      ...(couponCode ? { couponCode } : {}),
    },
    headers,
  );
}

let couponCounter = 0;
async function fixedCoupon(rupees: number): Promise<string> {
  const response = await admin.post<{ code: string }>("/v1/coupons", {
    code: `INTL${process.pid}X${++couponCounter}`,
    discountType: "fixed",
    discountValue: rupees,
    startsAt: new Date(Date.now() - DAY).toISOString(),
    expiresAt: new Date(Date.now() + 30 * DAY).toISOString(),
  });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body.data!.code;
}

await test("the pricing region follows the request's country, and is never cached", async () => {
  const visitor = flow.visitor();
  const abroad = await visitor.request<{ region: string; country: string }>(
    "GET",
    "/v1/checkout/pricing-region",
    undefined,
    FROM_JAPAN,
  );
  assert.equal(abroad.status, 200);
  assert.deepEqual(abroad.body.data, {
    region: "international",
    country: "JP",
  });
  assert.match(String(abroad.headers["cache-control"]), /no-store/u);

  const home = await visitor.request<{ region: string }>(
    "GET",
    "/v1/checkout/pricing-region",
    undefined,
    FROM_INDIA,
  );
  assert.equal(home.body.data?.region, "domestic");

  // Cloudflare's "unknown" and no header at all: rupees.
  for (const headers of [{ "cf-ipcountry": "XX" }, {}] as Record<
    string,
    string
  >[]) {
    const unknown = await visitor.request<{ region: string }>(
      "GET",
      "/v1/checkout/pricing-region",
      undefined,
      headers,
    );
    assert.equal(unknown.body.data?.region, "domestic");
  }
});

await test("every visitor is sent both prices, whatever their country", async () => {
  const course = await dualPricedCourse();
  const access = await flow.visitor().request<{
    pricing: { price: number; international: unknown };
  }>("GET", `/v1/courses/${course.slug}/access`, undefined, FROM_INDIA);
  assert.equal(access.status, 200, JSON.stringify(access.body));
  assert.equal(access.body.data?.pricing.price, 3499);
  assert.deepEqual(access.body.data?.pricing.international, {
    currency: "USD",
    priceMinor: 6499,
    salePriceMinor: 4399,
  });
});

await test("a buyer outside India is charged the dollar price, in cents", async () => {
  const course = await dualPricedCourse();
  const { client: learner } = await signedUpLearner(flow);

  const shown = await preview(learner, course, FROM_JAPAN);
  assert.equal(shown.status, 200, JSON.stringify(shown.body));
  assert.equal(shown.body.data?.pricing.currency, "USD");
  assert.equal(shown.body.data?.pricing.amountUnit, "minor");
  assert.equal(shown.body.data?.pricing.totalAmount, 4399);

  const started = await checkout(learner, course, FROM_JAPAN);
  assert.equal(started.status, 200, JSON.stringify(started.body));
  const order = started.body.data!;
  assert.deepEqual(
    { amount: order.gateway?.amount, currency: order.gateway?.currency },
    { amount: 4399, currency: "USD" },
  );

  const paid = flow.gateway.pay(order.gateway!.gatewayOrderId);
  const confirmed = await learner.post<{ verified: boolean }>(
    "/v1/payments/verify",
    {
      orderId: order.order.id,
      gatewayOrderId: order.gateway!.gatewayOrderId,
      ...paid,
    },
  );
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
  assert.ok((await myCourseIds(learner)).includes(course.id));

  // Kept in cents, with what it settled for in rupees.
  const stored = await flow.database
    .selectFrom("orders")
    .select([
      "currency",
      "total_amount",
      "status",
      "settlement_amount",
      "settlement_currency",
    ])
    .where("id", "=", order.order.id)
    .executeTakeFirstOrThrow();
  assert.deepEqual(stored, {
    currency: "USD",
    total_amount: 4399,
    status: "paid",
    settlement_amount: 4399 * FAKE_RUPEES_PER_UNIT,
    settlement_currency: "INR",
  });
});

await test("a dollar sale counts in rupees in the order statistics", async () => {
  const course = await dualPricedCourse();
  const { client: learner } = await signedUpLearner(flow);
  const started = await checkout(learner, course, FROM_JAPAN);
  assert.equal(started.status, 200, JSON.stringify(started.body));
  const order = started.body.data!;
  const paid = flow.gateway.pay(order.gateway!.gatewayOrderId);
  const confirmed = await learner.post("/v1/payments/verify", {
    orderId: order.order.id,
    gatewayOrderId: order.gateway!.gatewayOrderId,
    ...paid,
  });
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));

  const stats = await admin.get<{
    netRevenue: number;
    totalOrders: number;
    currency: string;
  }>(`/v1/orders/stats?courseId=${course.id}`);
  assert.equal(stats.status, 200, JSON.stringify(stats.body));
  assert.deepEqual(
    {
      currency: stats.body.data?.currency,
      netRevenue: stats.body.data?.netRevenue,
      totalOrders: stats.body.data?.totalOrders,
    },
    {
      currency: "INR",
      netRevenue: 4399 * FAKE_RUPEES_PER_UNIT,
      totalOrders: 1,
    },
  );
});

await test("a buyer in India, or of unknown country, pays rupees as before", async () => {
  const course = await dualPricedCourse();
  for (const headers of [FROM_INDIA, {}] as Record<string, string>[]) {
    const { client: learner } = await signedUpLearner(flow);
    const started = await checkout(learner, course, headers);
    assert.equal(started.status, 200, JSON.stringify(started.body));
    assert.deepEqual(
      {
        amount: started.body.data?.gateway?.amount,
        currency: started.body.data?.gateway?.currency,
      },
      { amount: 349900, currency: "INR" },
    );
  }
});

await test("a course with no dollar price is sold in rupees abroad too", async () => {
  const course = await createCourse(flow, { price: 799 });
  const { client: learner } = await signedUpLearner(flow);
  const shown = await preview(learner, course, FROM_JAPAN);
  assert.equal(shown.status, 200, JSON.stringify(shown.body));
  assert.equal(shown.body.data?.pricing.currency, "INR");
  assert.equal(shown.body.data?.pricing.amountUnit, "major");
  assert.equal(shown.body.data?.pricing.totalAmount, 799);
});

await test("a rupee coupon takes the same share off a dollar price", async () => {
  const course = await dualPricedCourse();
  const { client: learner } = await signedUpLearner(flow);
  // ₹700 off ₹3,499 is 20.005...% of the price; of $43.99 that is 880.04
  // cents, rounded down to 880.
  const code = await fixedCoupon(700);

  const abroad = await preview(learner, course, FROM_JAPAN, code);
  assert.equal(abroad.status, 200, JSON.stringify(abroad.body));
  assert.equal(abroad.body.data?.pricing.discountAmount, 880);
  assert.equal(abroad.body.data?.pricing.totalAmount, 4399 - 880);
  assert.match(abroad.body.data?.couponValidation?.message ?? "", /\$8\.80/u);

  const home = await preview(learner, course, FROM_INDIA, code);
  assert.equal(home.body.data?.pricing.discountAmount, 700);
  assert.equal(home.body.data?.pricing.totalAmount, 2799);
});

interface SavedPricing {
  international: { priceMinor: number; salePriceMinor: number } | null;
  internationalAuto: boolean;
}

function savePricing(course: FlowCourse, body: Record<string, unknown>) {
  return admin.request<SavedPricing>(
    "PUT",
    `/v1/courses/${course.id}/pricing`,
    {
      currency: "INR",
      ...body,
    },
  );
}

await test("a course priced in rupees gets the automatic dollar price, rounded up to .99", async () => {
  const course = await createCourse(flow, { price: 999 });
  // ₹5,999 at ₹95 is $63.15 → $63.99; ₹9,999 is $105.25 → $105.99.
  const saved = await savePricing(course, { price: 9999, salePrice: 5999 });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.data?.internationalAuto, true);
  assert.deepEqual(saved.body.data?.international, {
    currency: "USD",
    priceMinor: 10599,
    salePriceMinor: 6399,
  });

  // The rupee price changes: the automatic dollar price follows.
  const raised = await savePricing(course, { price: 9999, salePrice: 6999 });
  assert.equal(raised.body.data?.international?.salePriceMinor, 7399);

  // Saved again with the same rupee prices: unchanged.
  const again = await savePricing(course, {
    price: 9999,
    salePrice: 6999,
    showDiscountBadge: true,
  });
  assert.equal(again.body.data?.international?.salePriceMinor, 7399);
});

await test("a typed dollar price stays as typed when the rupee price changes", async () => {
  const course = await createCourse(flow, { price: 999 });
  const typed = await savePricing(course, {
    price: 5999,
    salePrice: 5999,
    international: { currency: "USD", priceMinor: 6499, salePriceMinor: 6499 },
  });
  assert.equal(typed.body.data?.internationalAuto, false);

  const raised = await savePricing(course, { price: 7999, salePrice: 7999 });
  assert.equal(raised.body.data?.internationalAuto, false);
  assert.equal(raised.body.data?.international?.salePriceMinor, 6499);

  // Turned back to automatic: worked out again at once. ₹7,999 → $84.99.
  const auto = await savePricing(course, {
    price: 7999,
    salePrice: 7999,
    internationalAuto: true,
  });
  assert.equal(auto.body.data?.internationalAuto, true);
  assert.equal(auto.body.data?.international?.salePriceMinor, 8499);
});

await test("a dollar price can be removed, and a free course has none", async () => {
  const course = await dualPricedCourse();
  const removed = await admin.request<{ international: unknown }>(
    "PUT",
    `/v1/courses/${course.id}/pricing`,
    { price: 3499, salePrice: 3499, currency: "INR", international: null },
  );
  assert.equal(removed.status, 200, JSON.stringify(removed.body));
  assert.equal(removed.body.data?.international, null);

  const free = await admin.request<{ international: unknown }>(
    "PUT",
    `/v1/courses/${course.id}/pricing`,
    {
      price: 0,
      salePrice: 0,
      currency: "INR",
      international: { currency: "USD", priceMinor: 999, salePriceMinor: 999 },
    },
  );
  assert.equal(free.status, 200, JSON.stringify(free.body));
  assert.equal(free.body.data?.international, null);
});

await test("an order mixing a dollar-priced course with a rupee-only one is charged in rupees abroad", async () => {
  const dollars = await dualPricedCourse();
  const rupeesOnly = await createCourse(flow, { price: 799 });
  const { client: learner } = await signedUpLearner(flow);
  const shown = await learner.request<Preview>(
    "POST",
    "/v1/checkout/preview",
    {
      items: [
        { itemType: "course", courseId: dollars.id },
        { itemType: "course", courseId: rupeesOnly.id },
      ],
    },
    FROM_JAPAN,
  );
  assert.equal(shown.status, 200, JSON.stringify(shown.body));
  assert.equal(shown.body.data?.pricing.currency, "INR");
  assert.equal(shown.body.data?.pricing.amountUnit, "major");
  assert.equal(shown.body.data?.pricing.totalAmount, 3499 + 799);
});

await test("a course priced in another currency gets no automatic dollar price", async () => {
  const course = await createCourse(flow, { price: 999 });
  const saved = await savePricing(course, {
    currency: "USD",
    price: 49,
    salePrice: 49,
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.data?.international, null);
});

await test("a dollar payment confirmed by the webhook alone records its settlement", async () => {
  const course = await dualPricedCourse();
  const { client: learner } = await signedUpLearner(flow);
  const started = await checkout(learner, course, FROM_JAPAN);
  assert.equal(started.status, 200, JSON.stringify(started.body));
  const order = started.body.data!;
  const paid = flow.gateway.pay(order.gateway!.gatewayOrderId);

  // The browser closed before confirming: only the gateway's webhook comes.
  const body = JSON.stringify({
    event: "payment.captured",
    gatewayPaymentId: paid.gatewayPaymentId,
  });
  const delivered = await flow
    .visitor()
    .request("POST", "/v1/webhooks/razorpay", body, {
      "x-razorpay-signature": flow.gateway.webhookSignatureFor(body),
      "x-razorpay-event-id": `evt_${paid.gatewayPaymentId}_captured`,
    });
  assert.ok(delivered.status < 300, JSON.stringify(delivered.body));

  const deadline = Date.now() + 10_000;
  let stored: { status: string; settlement_amount: number | null } | undefined;
  while (Date.now() < deadline) {
    stored = await flow.database
      .selectFrom("orders")
      .select(["status", "settlement_amount"])
      .where("id", "=", order.order.id)
      .executeTakeFirstOrThrow();
    if (stored.status === "paid" && stored.settlement_amount !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.deepEqual(stored, {
    status: "paid",
    settlement_amount: 4399 * FAKE_RUPEES_PER_UNIT,
  });
});

await flow.close();
