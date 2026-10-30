import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test } from "node:test";

import { loadServerConfig } from "@veolms/config";
import {
  CashfreePaymentGateway,
  createPaymentGateways,
  DodoPaymentGateway,
} from "@veolms/services";

const razorpayKeys = {
  NODE_ENV: "development",
  RAZORPAY_KEY_ID: "rzp_test_key",
  RAZORPAY_KEY_SECRET: "rzp_test_secret",
  RAZORPAY_WEBHOOK_SECRET: "rzp_webhook_secret",
};

function gateways(env: Record<string, string> = {}) {
  return createPaymentGateways(loadServerConfig({ ...razorpayKeys, ...env }));
}

await test("buyers in India get Razorpay and everyone else Dodo Payments, once Dodo is set up", () => {
  const all = gateways({ DODO_PAYMENTS_API_KEY: "dodo_test_key" });
  assert.equal(all.forCountry("IN").providerName, "razorpay");
  assert.equal(all.forCountry("in").providerName, "razorpay");
  assert.equal(all.forCountry("US").providerName, "dodo");
  assert.equal(all.forCountry("PK").providerName, "dodo");
  assert.deepEqual(
    all.all.map((gateway) => gateway.providerName),
    ["razorpay", "dodo"],
  );
});

await test("a buyer whose country is not known gets the default gateway", () => {
  const all = gateways({ DODO_PAYMENTS_API_KEY: "dodo_test_key" });
  for (const country of [null, undefined, "", "XX", "T1"]) {
    assert.equal(all.forCountry(country).providerName, "razorpay");
  }
});

await test("without a Dodo key every checkout stays on Razorpay, as before", () => {
  const all = gateways();
  assert.equal(all.forCountry("US").providerName, "razorpay");
  assert.equal(all.get("dodo"), undefined);
  assert.equal(all.get("razorpay"), all.primary);
});

await test("the country rules and the default can be changed", () => {
  const all = gateways({
    DODO_PAYMENTS_API_KEY: "dodo_test_key",
    PAYMENT_GATEWAY_DEFAULT: "dodo",
    PAYMENT_GATEWAY_BY_COUNTRY: "IN:razorpay, NP:razorpay",
  });
  assert.equal(all.primary.providerName, "dodo");
  assert.equal(all.forCountry("NP").providerName, "razorpay");
  assert.equal(all.forCountry("US").providerName, "dodo");
  assert.equal(all.forCountry(null).providerName, "dodo");
});

await test("a default gateway that is not set up stops the API from starting", () => {
  assert.throws(
    () => gateways({ PAYMENT_GATEWAY_DEFAULT: "dodo" }),
    /PAYMENT_GATEWAY_DEFAULT is "dodo"/,
  );
});

await test("a malformed country rule is refused with the config", () => {
  assert.throws(
    () => gateways({ PAYMENT_GATEWAY_BY_COUNTRY: "India=razorpay" }),
    /country:gateway pairs/,
  );
});

// Standard Webhooks, as Dodo Payments signs its deliveries.
const webhookSecretBytes = crypto.randomBytes(24);
const webhookKey = `whsec_${webhookSecretBytes.toString("base64")}`;

function dodo() {
  return new DodoPaymentGateway({
    apiKey: "dodo_test_key",
    webhookKey,
    environment: "test_mode",
    returnUrl: "http://localhost:3000/purchase-history",
  });
}

function signed(body: string, at = Math.floor(Date.now() / 1000)) {
  const id = "msg_2b7XyZ";
  const signature = crypto
    .createHmac("sha256", webhookSecretBytes)
    .update(`${id}.${at}.${body}`)
    .digest("base64");
  return {
    "webhook-id": id,
    "webhook-timestamp": String(at),
    "webhook-signature": `v1,${signature}`,
  };
}

await test("a Dodo webhook signed with the endpoint's secret is accepted, and its id read", () => {
  const body = JSON.stringify({ type: "payment.succeeded", data: {} });
  const headers = signed(body);
  assert.equal(dodo().verifyWebhookSignature(Buffer.from(body), headers), true);
  assert.equal(dodo().webhookEventId(headers), "msg_2b7XyZ");
  // One of several signatures is enough (the secret is being rotated).
  assert.equal(
    dodo().verifyWebhookSignature(body, {
      ...headers,
      "webhook-signature": `v1,bm90IGl0 ${headers["webhook-signature"]}`,
    }),
    true,
  );
});

await test("a Dodo webhook that was changed, unsigned or old is refused", () => {
  const body = JSON.stringify({ type: "payment.succeeded", data: {} });
  const headers = signed(body);
  const gateway = dodo();
  assert.equal(gateway.verifyWebhookSignature(body + " ", headers), false);
  assert.equal(
    gateway.verifyWebhookSignature(body, {
      ...headers,
      "webhook-signature": undefined,
    }),
    false,
  );
  const tenMinutesAgo = Math.floor(Date.now() / 1000) - 600;
  assert.equal(
    gateway.verifyWebhookSignature(body, signed(body, tenMinutesAgo)),
    false,
  );
  const unkeyed = new DodoPaymentGateway({
    apiKey: "dodo_test_key",
    environment: "test_mode",
    returnUrl: "http://localhost:3000/purchase-history",
  });
  assert.equal(unkeyed.verifyWebhookSignature(body, headers), false);
});

const succeeded = {
  business_id: "bus_1",
  type: "payment.succeeded",
  timestamp: "2026-10-28T10:00:00Z",
  data: {
    payload_type: "Payment",
    payment_id: "pay_1",
    checkout_session_id: "cks_1",
    status: "succeeded",
    total_amount: 899900,
    currency: "INR",
    payment_method: "card",
    card_last_four: "4242",
    card_network: "visa",
    metadata: { veolms_amount: "899900", veolms_currency: "INR" },
  },
};

await test("a Dodo payment event names the checkout session it paid, as the gateway order", () => {
  const event = dodo().normalizeWebhookEvent(succeeded, "msg_1");
  assert.equal(event.eventType, "payment.succeeded");
  assert.equal(event.eventId, "msg_1");
  assert.equal(event.provider, "dodo");
  assert.equal(event.gatewayOrderId, "cks_1");
  assert.equal(event.gatewayPaymentId, "pay_1");
  assert.equal(event.amount, 899900);
  assert.equal(event.currency, "INR");
  assert.deepEqual(event.paymentMethod, {
    method: "card",
    cardLast4: "4242",
    cardNetwork: "visa",
  });
});

await test("a Dodo payment charged in the buyer's own currency is reported in the order's", () => {
  const event = dodo().normalizeWebhookEvent({
    ...succeeded,
    data: { ...succeeded.data, total_amount: 10899, currency: "USD" },
  });
  assert.equal(event.amount, 899900);
  assert.equal(event.currency, "INR");
});

await test("tax Dodo added on top of the price is the buyer's: the payment counts at the order's amount", () => {
  const event = dodo().normalizeWebhookEvent({
    ...succeeded,
    data: { ...succeeded.data, total_amount: 1061882, tax: 161982 },
  });
  assert.equal(event.amount, 899900);
  assert.equal(event.currency, "INR");
});

await test("tax Dodo took out of the price leaves the payment at the full price", () => {
  const event = dodo().normalizeWebhookEvent({
    ...succeeded,
    data: { ...succeeded.data, total_amount: 899900, tax: 137273 },
  });
  assert.equal(event.amount, 899900);
});

await test("Dodo failures and refunds are told apart; other events are ignored", () => {
  const gateway = dodo();
  assert.equal(
    gateway.normalizeWebhookEvent({ ...succeeded, type: "payment.failed" })
      .eventType,
    "payment.failed",
  );
  const refund = gateway.normalizeWebhookEvent({
    type: "refund.succeeded",
    data: {
      payload_type: "Refund",
      refund_id: "ref_1",
      payment_id: "pay_1",
      amount: 10899,
      currency: "USD",
      is_partial: false,
      status: "succeeded",
    },
  });
  assert.equal(refund.eventType, "refund.succeeded");
  assert.equal(refund.gatewayRefundId, "ref_1");
  assert.equal(refund.gatewayPaymentId, "pay_1");
  // A full refund leaves the amount to the payment's own, in the order's
  // currency.
  assert.equal(refund.amount, undefined);
  assert.equal(
    gateway.normalizeWebhookEvent({ type: "subscription.active", data: {} })
      .eventType,
    "ignored",
  );
});

await test("a Dodo checkout session reopens at its hosted checkout", () => {
  assert.equal(
    dodo().checkoutUrl("cks_abc"),
    "https://test.checkout.dodopayments.com/session/cks_abc",
  );
});

await test("Cashfree takes the buyers a country rule sends to it, once its keys are set", () => {
  const all = gateways({
    CASHFREE_APP_ID: "TEST_app",
    CASHFREE_SECRET_KEY: "cfsk_ma_test_secret",
    PAYMENT_GATEWAY_BY_COUNTRY: "IN:razorpay,*:cashfree",
  });
  assert.equal(all.forCountry("US").providerName, "cashfree");
  assert.equal(all.forCountry("IN").providerName, "razorpay");
  assert.equal(
    gateways({ PAYMENT_GATEWAY_BY_COUNTRY: "*:cashfree" }).forCountry("US")
      .providerName,
    "razorpay",
  );
});

const cashfreeSecret = "cfsk_ma_test_secret";

function cashfree() {
  return new CashfreePaymentGateway({
    appId: "TEST_app",
    secretKey: cashfreeSecret,
    environment: "sandbox",
    returnUrl: "http://localhost:3000/purchase-history",
  });
}

function cashfreeSigned(body: string) {
  const timestamp = String(Date.now());
  return {
    "x-webhook-timestamp": timestamp,
    "x-webhook-signature": crypto
      .createHmac("sha256", cashfreeSecret)
      .update(timestamp + body)
      .digest("base64"),
  };
}

await test("a Cashfree webhook signed with the secret key is accepted; a changed one is not", () => {
  const body = JSON.stringify({ type: "PAYMENT_SUCCESS_WEBHOOK", data: {} });
  const headers = cashfreeSigned(body);
  const gateway = cashfree();
  assert.equal(
    gateway.verifyWebhookSignature(Buffer.from(body), headers),
    true,
  );
  assert.equal(gateway.verifyWebhookSignature(body + " ", headers), false);
  assert.equal(
    gateway.verifyWebhookSignature(body, {
      ...headers,
      "x-webhook-signature": undefined,
    }),
    false,
  );
});

const cashfreeSuccess = {
  type: "PAYMENT_SUCCESS_WEBHOOK",
  event_time: "2026-10-29T10:00:00+05:30",
  data: {
    order: { order_id: "veo_1", order_amount: 699, order_currency: "INR" },
    payment: {
      cf_payment_id: 5114910893874,
      payment_status: "SUCCESS",
      payment_amount: 699.0,
      payment_currency: "INR",
      payment_group: "credit_card",
      payment_method: {
        card: { card_number: "XXXXXXXXXXXX1111", card_network: "visa" },
      },
    },
  },
};

await test("a Cashfree payment is named with its order, in minor units", () => {
  const event = cashfree().normalizeWebhookEvent(cashfreeSuccess);
  assert.equal(event.eventType, "payment.succeeded");
  assert.equal(event.provider, "cashfree");
  assert.equal(event.gatewayOrderId, "veo_1");
  assert.equal(event.gatewayPaymentId, "veo_1:5114910893874");
  assert.equal(event.amount, 69900);
  assert.equal(event.currency, "INR");
  assert.deepEqual(event.paymentMethod, {
    method: "card",
    bank: null,
    wallet: null,
    vpa: null,
    cardLast4: "1111",
    cardNetwork: "visa",
  });
  // The same delivery sent again is the same event.
  assert.equal(
    cashfree().normalizeWebhookEvent(cashfreeSuccess).eventId,
    event.eventId,
  );
});

await test("Cashfree failures, drop-offs and refunds are told apart", () => {
  const gateway = cashfree();
  for (const type of [
    "PAYMENT_FAILED_WEBHOOK",
    "PAYMENT_USER_DROPPED_WEBHOOK",
  ]) {
    assert.equal(
      gateway.normalizeWebhookEvent({ ...cashfreeSuccess, type }).eventType,
      "payment.failed",
    );
  }
  const refund = (refund_status: string) =>
    gateway.normalizeWebhookEvent({
      type: "REFUND_STATUS_WEBHOOK",
      data: {
        refund: {
          cf_payment_id: 5114910893874,
          refund_id: "rf_1",
          order_id: "veo_1",
          refund_amount: 100.5,
          refund_currency: "INR",
          refund_status,
        },
      },
    });
  const done = refund("SUCCESS");
  assert.equal(done.eventType, "refund.succeeded");
  assert.equal(done.gatewayRefundId, "veo_1:rf_1");
  assert.equal(done.gatewayPaymentId, "veo_1:5114910893874");
  assert.equal(done.amount, 10050);
  assert.equal(refund("PENDING").eventType, "refund.pending");
  assert.equal(refund("CANCELLED").eventType, "refund.failed");
  assert.notEqual(refund("PENDING").eventId, done.eventId);
  assert.equal(
    gateway.normalizeWebhookEvent({ type: "WEBHOOK", data: {} }).eventType,
    "ignored",
  );
});

await test("ending a Cashfree order asks Cashfree to terminate it", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ order_status: "TERMINATED" }), {
      status: 200,
    });
  }) as typeof fetch;
  try {
    await cashfree().cancelOrder("veo_1");
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "https://sandbox.cashfree.com/pg/orders/veo_1");
  assert.equal(calls[0]?.init?.method, "PATCH");
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
    order_status: "TERMINATED",
  });
});
