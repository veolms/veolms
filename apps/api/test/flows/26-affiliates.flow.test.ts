/**
 * The affiliate program's tracking (Affiliate management system PRD,
 * sections 9.2 and 11): a visit through an affiliate's link, the cookie it
 * leaves, tying it to the account that signs in, and who gets credit for an
 * order. Commissions come with the payment (a later phase); these tests
 * look at the credit decided when the order is made.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test } from "node:test";

// The flow environment is set before anything reads the API's config.
import "./setup/flow-env.ts";
import { AFFILIATE_CLICK_COOKIE } from "@veolms/contracts";

import { createPlatformSettingsService } from "../../src/modules/platform/index.ts";
import {
  approveDueCommissions,
  reconcileCommissions,
  recordRefundReversals,
} from "../../src/modules/affiliates/affiliate-commissions.service.ts";
import { createRefundReconciliationWorker } from "../../src/modules/commerce/fulfillment/refund-reconciliation.worker.ts";
import { fakePaymentGateways } from "./setup/fake-payment-gateway.ts";
import {
  signedInAdmin,
  signedUpLearner,
  startFlowApp,
} from "./setup/flow-app.ts";
import type { FlowClient } from "./setup/flow-app.ts";
import { createCourse } from "./setup/flow-courses.ts";
import type { FlowCourse } from "./setup/flow-courses.ts";

const flow = await startFlowApp();
const admin = await signedInAdmin(flow);
const settings = createPlatformSettingsService({ database: flow.database });

const BROWSER =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const DAY = 24 * 60 * 60 * 1000;

await settings.updateAffiliateProgramSettings({ enabled: true }, null);

let codeCounter = 0;

/** A learner who is an affiliate with the given status. */
async function affiliate(
  status: "approved" | "pending" | "suspended" = "approved",
) {
  const person = await signedUpLearner(flow, "affiliate");
  const code = `aff${process.pid % 10000}x${++codeCounter}`;
  const row = await flow.database
    .insertInto("affiliates")
    .values({ user_id: person.userId, code, status })
    .returning("id")
    .executeTakeFirstOrThrow();
  return { ...person, code, id: row.id };
}

/** The page read ?ref= and tells the API once. */
function visit(client: FlowClient, code: string, path = "/courses/flow") {
  return client.request<{ ok: true }>(
    "POST",
    "/v1/affiliate/clicks",
    {
      code: code.toUpperCase(),
      landingPath: path,
      referrer: "https://www.youtube.com/watch?v=x",
    },
    { "user-agent": BROWSER },
  );
}

function clicksFor(affiliateId: string) {
  return flow.database
    .selectFrom("affiliate_clicks")
    .selectAll()
    .where("affiliate_id", "=", affiliateId)
    .execute();
}

async function checkout(
  client: FlowClient,
  course: FlowCourse,
  couponCode?: string,
) {
  const response = await client.post<{ order: { id: string } }>(
    "/v1/checkout/orders",
    {
      items: [{ itemType: "course", courseId: course.id }],
      ...(couponCode ? { couponCode } : {}),
    },
  );
  return response;
}

async function creditFor(orderId: string) {
  return await flow.database
    .selectFrom("affiliate_order_attributions")
    .selectAll()
    .where("order_id", "=", orderId)
    .executeTakeFirst();
}

async function personalCoupon(affiliateId: string, code: string) {
  const made = await admin.post<{ code: string }>("/v1/coupons", {
    code: code.toUpperCase(),
    discountType: "percentage",
    discountValue: 10,
    perUserLimit: 5,
    startsAt: new Date(Date.now() - DAY).toISOString(),
    expiresAt: new Date(Date.now() + 30 * DAY).toISOString(),
  });
  assert.equal(made.status, 200, JSON.stringify(made.body));
  const coupon = await flow.database
    .selectFrom("coupons")
    .select("id")
    .where("code", "=", code.toUpperCase())
    .executeTakeFirstOrThrow();
  await flow.database
    .updateTable("affiliates")
    .set({ coupon_id: coupon.id })
    .where("id", "=", affiliateId)
    .execute();
  return code.toUpperCase();
}

await test("a visit through a link records one click and leaves an HttpOnly cookie for the window; a second within 30 minutes records none", async () => {
  const rahul = await affiliate();
  const visitor = flow.visitor();

  const first = await visit(visitor, rahul.code);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.deepEqual(first.body.data, { ok: true });
  const setCookie = String(first.headers["set-cookie"]);
  assert.match(setCookie, new RegExp(`${AFFILIATE_CLICK_COOKIE}=`, "u"));
  assert.match(setCookie, /HttpOnly/u);
  assert.match(setCookie, /Max-Age=2592000/u);
  assert.doesNotMatch(setCookie, /Domain=/u);

  await visit(visitor, rahul.code);
  const clicks = await clicksFor(rahul.id);
  assert.equal(clicks.length, 1);
  assert.equal(clicks[0]!.landing_path, "/courses/flow");
  assert.equal(clicks[0]!.referrer_host, "www.youtube.com");
  assert.match(clicks[0]!.ip_hash, /^[0-9a-f]{64}$/u);
  assert.notEqual(clicks[0]!.ip_hash, visitor.address);
});

await test("an unknown code and a suspended affiliate's code answer the same, and record nothing", async () => {
  const suspended = await affiliate("suspended");
  for (const code of ["nobody-has-this", suspended.code]) {
    const visitor = flow.visitor();
    const response = await visit(visitor, code);
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.data, { ok: true });
    assert.equal(visitor.cookies.has(AFFILIATE_CLICK_COOKIE), false, code);
  }
  assert.equal((await clicksFor(suspended.id)).length, 0);
});

await test("a crawler's visit is not a click", async () => {
  const rahul = await affiliate();
  const crawler = flow.visitor();
  await crawler.request(
    "POST",
    "/v1/affiliate/clicks",
    { code: rahul.code },
    { "user-agent": "Googlebot/2.1 (+http://www.google.com/bot.html)" },
  );
  assert.equal((await clicksFor(rahul.id)).length, 0);
});

await test("link A, then link B, then a purchase: B gets the credit", async () => {
  const a = await affiliate();
  const b = await affiliate();
  const course = await createCourse(flow, { pricing: "paid", price: 4_999 });
  const { client } = await signedUpLearner(flow, "buyer");

  await visit(client, a.code);
  await visit(client, b.code);
  const order = await checkout(client, course);
  assert.equal(order.status, 200, JSON.stringify(order.body));

  const credit = await creditFor(order.body.data!.order.id);
  assert.equal(credit?.affiliate_id, b.id);
  assert.equal(credit?.source, "link");
});

await test("link A, then B's code typed at checkout: the code's owner gets the credit", async () => {
  const a = await affiliate();
  const b = await affiliate();
  const code = await personalCoupon(b.id, b.code);
  const course = await createCourse(flow, { pricing: "paid", price: 4_999 });
  const { client } = await signedUpLearner(flow, "buyer");

  await visit(client, a.code);
  const order = await checkout(client, course, code);
  assert.equal(order.status, 200, JSON.stringify(order.body));

  const credit = await creditFor(order.body.data!.order.id);
  assert.equal(credit?.affiliate_id, b.id);
  assert.equal(credit?.source, "code");
});

await test("a buyer who arrives by A's link and types an ordinary coupon keeps A's credit", async () => {
  const a = await affiliate();
  const ordinary = `PLAIN${process.pid}X${++codeCounter}`;
  const made = await admin.post("/v1/coupons", {
    code: ordinary,
    discountType: "percentage",
    discountValue: 10,
    perUserLimit: 5,
    startsAt: new Date(Date.now() - DAY).toISOString(),
    expiresAt: new Date(Date.now() + 30 * DAY).toISOString(),
  });
  assert.equal(made.status, 200, JSON.stringify(made.body));
  const course = await createCourse(flow, { pricing: "paid", price: 4_999 });
  const { client } = await signedUpLearner(flow, "buyer");

  await visit(client, a.code);
  const order = await checkout(client, course, ordinary);
  assert.equal(order.status, 200, JSON.stringify(order.body));
  assert.equal(
    (await creditFor(order.body.data!.order.id))?.affiliate_id,
    a.id,
  );
});

await test("click on one device and sign in there; buy on another with no cookie: still credited through the account", async () => {
  const a = await affiliate();
  const course = await createCourse(flow, { pricing: "paid", price: 4_999 });
  const { client: phone, learner } = await signedUpLearner(flow, "buyer");
  // Signed out on the phone when the link was tapped.
  const visitorPhone = flow.visitor();
  await visit(visitorPhone, a.code);
  assert.equal((await visitorPhone.signIn(learner.email)).status, 200);
  const claimed = await visitorPhone.post("/v1/affiliate/referrals/claim");
  assert.equal(claimed.status, 200, JSON.stringify(claimed.body));

  // The laptop never saw the link.
  assert.equal(phone.cookies.has(AFFILIATE_CLICK_COOKIE), false);
  const order = await checkout(phone, course);
  assert.equal(order.status, 200, JSON.stringify(order.body));
  const credit = await creditFor(order.body.data!.order.id);
  assert.equal(credit?.affiliate_id, a.id);
  assert.equal(credit?.source, "account");
});

await test("a purchase after the window has passed has no affiliate", async () => {
  const a = await affiliate();
  const course = await createCourse(flow, { pricing: "paid", price: 4_999 });
  const { client } = await signedUpLearner(flow, "buyer");

  await visit(client, a.code);
  await flow.database
    .updateTable("affiliate_clicks")
    .set({ expires_at: new Date(Date.now() - DAY) })
    .where("affiliate_id", "=", a.id)
    .execute();
  await flow.database
    .updateTable("affiliate_referrals")
    .set({ expires_at: new Date(Date.now() - DAY) })
    .where("affiliate_id", "=", a.id)
    .execute();

  const order = await checkout(client, course);
  assert.equal(order.status, 200, JSON.stringify(order.body));
  assert.equal(await creditFor(order.body.data!.order.id), undefined);
});

await test("an affiliate buying through their own link gets no credit, and their own code is refused", async () => {
  const rahul = await affiliate();
  const code = await personalCoupon(rahul.id, rahul.code);
  const course = await createCourse(flow, { pricing: "paid", price: 4_999 });

  await visit(rahul.client, rahul.code);
  const refused = await checkout(rahul.client, course, code);
  assert.equal(refused.status, 400);
  assert.equal(refused.body.error?.code, "AFFILIATE_OWN_COUPON");

  const order = await checkout(rahul.client, course);
  assert.equal(order.status, 200, JSON.stringify(order.body));
  assert.equal(await creditFor(order.body.data!.order.id), undefined);
});

await test("a cookie edited by hand is ignored", async () => {
  const a = await affiliate();
  const b = await affiliate();
  const course = await createCourse(flow, { pricing: "paid", price: 4_999 });
  const { client } = await signedUpLearner(flow, "buyer");

  // A click for B made elsewhere, its id pasted into A's buyer's cookie.
  const elsewhere = flow.visitor();
  await visit(elsewhere, b.code);
  const [bClick] = await clicksFor(b.id);
  await visit(client, a.code);
  const signed = client.cookies.get(AFFILIATE_CLICK_COOKIE)!;
  client.cookies.set(
    AFFILIATE_CLICK_COOKIE,
    `${bClick!.id}.${signed.split(".").at(-1)}`,
  );
  // And A's account link is cleared, so only the cookie could credit.
  await flow.database
    .deleteFrom("affiliate_referrals")
    .where("affiliate_id", "=", a.id)
    .execute();

  const order = await checkout(client, course);
  assert.equal(order.status, 200, JSON.stringify(order.body));
  assert.equal(await creditFor(order.body.data!.order.id), undefined);
});

await test("with the program switched off, links record nothing and orders get no credit", async () => {
  const a = await affiliate();
  const course = await createCourse(flow, { pricing: "paid", price: 4_999 });
  const { client } = await signedUpLearner(flow, "buyer");
  await visit(client, a.code);

  await settings.updateAffiliateProgramSettings({ enabled: false }, null);
  try {
    const visitor = flow.visitor();
    await visit(visitor, a.code);
    assert.equal(visitor.cookies.has(AFFILIATE_CLICK_COOKIE), false);
    const order = await checkout(client, course);
    assert.equal(order.status, 200, JSON.stringify(order.body));
    assert.equal(await creditFor(order.body.data!.order.id), undefined);
  } finally {
    await settings.updateAffiliateProgramSettings({ enabled: true }, null);
  }
});

await test("when deciding the credit fails, the order is still made", async () => {
  const a = await affiliate();
  const course = await createCourse(flow, { pricing: "paid", price: 4_999 });
  const { client } = await signedUpLearner(flow, "buyer");
  await visit(client, a.code);

  const hidden = `affiliate_order_attributions_hidden_${crypto.randomUUID().slice(0, 8)}`;
  await flow.database.schema
    .alterTable("affiliate_order_attributions")
    .renameTo(hidden)
    .execute();
  try {
    const order = await checkout(client, course);
    assert.equal(order.status, 200, JSON.stringify(order.body));
    const made = await flow.database
      .selectFrom("orders")
      .select("status")
      .where("id", "=", order.body.data!.order.id)
      .executeTakeFirst();
    assert.equal(made?.status, "pending");
  } finally {
    await flow.database.schema
      .alterTable(hidden)
      .renameTo("affiliate_order_attributions")
      .execute();
  }
});

await test("the join page's facts are public; the terms and numbers are the program's", async () => {
  const response = await flow.visitor().get<{
    enabled: boolean;
    attributionWindowDays: number;
    holdDays: number;
    minPayoutMinor: number;
  }>("/v1/affiliate/program");
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.data?.enabled, true);
  assert.equal(response.body.data?.attributionWindowDays, 30);
  assert.equal(response.body.data?.holdDays, 30);
  assert.equal(response.body.data?.minPayoutMinor, 50_000);
});

// ------------------------------------------------------------ commissions

const silentLogger = {
  info() {},
  warn() {},
  error() {},
  debug() {},
  fatal() {},
  trace() {},
  silent() {},
  child() {
    return silentLogger;
  },
} as unknown as Parameters<
  typeof createRefundReconciliationWorker
>[0]["logger"];

// The program's default rate (switching the program on writes it; the
// admin side comes later).
const programDefault = await flow.database
  .selectFrom("affiliate_commission_rules")
  .select("id")
  .where("affiliate_id", "is", null)
  .where("target_type", "is", null)
  .where("archived_at", "is", null)
  .executeTakeFirst();
if (!programDefault) {
  await flow.database
    .insertInto("affiliate_commission_rules")
    .values({ rate_type: "percent", rate_value: 2000 })
    .execute();
}

interface Bought {
  orderId: string;
  gatewayPaymentId: string;
}

/** Checks out, pays with the fake gateway and confirms, as the browser does. */
async function buyThrough(
  client: FlowClient,
  courses: FlowCourse[],
  couponCode?: string,
): Promise<Bought> {
  const response = await client.post<{
    order: { id: string; status: string };
    gateway: { gatewayOrderId: string } | null;
  }>("/v1/checkout/orders", {
    items: courses.map((course) => ({
      itemType: "course",
      courseId: course.id,
    })),
    ...(couponCode ? { couponCode } : {}),
  });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const checkout = response.body.data!;
  if (!checkout.gateway)
    return { orderId: checkout.order.id, gatewayPaymentId: "" };
  const paid = flow.gateway.pay(checkout.gateway.gatewayOrderId);
  const confirmed = await client.post("/v1/payments/verify", {
    orderId: checkout.order.id,
    gatewayOrderId: checkout.gateway.gatewayOrderId,
    ...paid,
  });
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
  return {
    orderId: checkout.order.id,
    gatewayPaymentId: paid.gatewayPaymentId,
  };
}

function ledger(affiliateId: string) {
  return flow.database
    .selectFrom("affiliate_commissions")
    .selectAll()
    .where("affiliate_id", "=", affiliateId)
    .orderBy("created_at")
    .orderBy("amount", "desc")
    .execute();
}

async function balances(affiliateId: string) {
  const rows = await ledger(affiliateId);
  const sum = (pick: (row: (typeof rows)[number]) => boolean) =>
    rows
      .filter(pick)
      .reduce((total, row) => total + (row.payout_amount ?? 0), 0);
  return {
    pending: sum((row) => row.status === "pending"),
    available: sum(
      (row) => row.status === "approved" && row.payout_id === null,
    ),
  };
}

/** A buyer who came through the affiliate's link. */
async function referredBuyer(code: string) {
  const buyer = await signedUpLearner(flow, "buyer");
  await visit(buyer.client, code);
  return buyer;
}

await test("a paid order with two courses under different rules earns two pending commissions with their rule", async () => {
  const rahul = await affiliate();
  const react = await createCourse(flow, { pricing: "paid", price: 5_000 });
  const node = await createCourse(flow, { pricing: "paid", price: 2_000 });
  const nodeRule = await flow.database
    .insertInto("affiliate_commission_rules")
    .values({
      target_type: "course",
      target_id: node.id,
      rate_type: "percent",
      rate_value: 3000,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  const { client } = await referredBuyer(rahul.code);

  const bought = await buyThrough(client, [react, node]);

  const rows = await ledger(rahul.id);
  assert.equal(rows.length, 2);
  const byAmount = new Map(rows.map((row) => [row.amount, row]));
  // ₹5,000 at the default 20%, ₹2,000 at the course's own 30%.
  assert.ok(byAmount.has(100_000), JSON.stringify(rows.map((r) => r.amount)));
  assert.equal(byAmount.get(60_000)?.rule_id, nodeRule.id);
  assert.equal(byAmount.get(60_000)?.rate_value, 3000);
  for (const row of rows) {
    assert.equal(row.kind, "sale");
    assert.equal(row.status, "pending");
    assert.equal(row.order_id, bought.orderId);
    assert.equal(row.payout_amount, row.amount);
    const held = row.available_at.getTime() - Date.now();
    assert.ok(held > 29 * DAY && held <= 30 * DAY, "held for 30 days");
  }
});

await test("the browser's confirmation and the gateway's webhook for one payment leave one commission per course", async () => {
  const rahul = await affiliate();
  const course = await createCourse(flow, { pricing: "paid", price: 4_000 });
  const { client } = await referredBuyer(rahul.code);
  const bought = await buyThrough(client, [course]);

  const body = JSON.stringify({
    event: "payment.captured",
    gatewayPaymentId: bought.gatewayPaymentId,
  });
  for (let i = 0; i < 2; i += 1) {
    await flow.visitor().request("POST", "/v1/webhooks/razorpay", body, {
      "x-razorpay-signature": flow.gateway.webhookSignatureFor(body),
      "x-razorpay-event-id": `evt_${bought.gatewayPaymentId}_${i}`,
    });
  }
  await new Promise((resolve) => setTimeout(resolve, 1500));
  assert.equal((await ledger(rahul.id)).length, 1);
});

await test("changing a rule after a sale leaves that commission alone; the next sale uses the new rule", async () => {
  const rahul = await affiliate();
  const ownRule = await flow.database
    .insertInto("affiliate_commission_rules")
    .values({ affiliate_id: rahul.id, rate_type: "percent", rate_value: 2500 })
    .returning("id")
    .executeTakeFirstOrThrow();
  const course = await createCourse(flow, { pricing: "paid", price: 4_000 });

  await buyThrough((await referredBuyer(rahul.code)).client, [course]);
  // The rule is changed as rules are: archived, and a new one added.
  await flow.database
    .updateTable("affiliate_commission_rules")
    .set({ archived_at: new Date() })
    .where("id", "=", ownRule.id)
    .execute();
  await flow.database
    .insertInto("affiliate_commission_rules")
    .values({ affiliate_id: rahul.id, rate_type: "percent", rate_value: 4000 })
    .execute();
  await buyThrough((await referredBuyer(rahul.code)).client, [course]);

  const amounts = (await ledger(rahul.id)).map((row) => row.amount);
  assert.deepEqual(amounts, [100_000, 160_000]);
});

await test("a 100% coupon order earns nothing", async () => {
  const rahul = await affiliate();
  const course = await createCourse(flow, { pricing: "paid", price: 4_000 });
  const freeCode = `FREE${process.pid}X${++codeCounter}`;
  const made = await admin.post("/v1/coupons", {
    code: freeCode,
    discountType: "percentage",
    discountValue: 100,
    perUserLimit: 5,
    startsAt: new Date(Date.now() - DAY).toISOString(),
    expiresAt: new Date(Date.now() + 30 * DAY).toISOString(),
  });
  assert.equal(made.status, 200, JSON.stringify(made.body));

  await buyThrough(
    (await referredBuyer(rahul.code)).client,
    [course],
    freeCode,
  );
  assert.deepEqual(await ledger(rahul.id), []);
});

await test("an approved bank transfer earns the commission, as a card payment does", async () => {
  const rahul = await affiliate();
  const course = await createCourse(flow, { pricing: "paid", price: 4_000 });
  const { client } = await referredBuyer(rahul.code);
  const order = await client.post<{ order: { id: string } }>(
    "/v1/checkout/orders",
    { items: [{ itemType: "course", courseId: course.id }] },
  );
  assert.equal(order.status, 200, JSON.stringify(order.body));
  const orderId = order.body.data!.order.id;
  const submitted = await client.post<{ id: string }>(
    `/v1/orders/${orderId}/manual-payment`,
    { paymentMethod: "upi", transactionReference: `UTR${Date.now()}` },
  );
  assert.equal(submitted.status, 201, JSON.stringify(submitted.body));

  const verified = await admin.post(
    `/v1/manual-payments/${submitted.body.data!.id}/verify`,
    { action: "verify" },
  );
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  const rows = await ledger(rahul.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.amount, 80_000);
});

await test("a commission is pending until its hold period is over, then approved; a flagged one waits", async () => {
  const rahul = await affiliate();
  const priya = await affiliate();
  const course = await createCourse(flow, { pricing: "paid", price: 4_000 });
  await buyThrough((await referredBuyer(rahul.code)).client, [course]);
  await buyThrough((await referredBuyer(priya.code)).client, [course]);
  await flow.database
    .updateTable("affiliate_commissions")
    .set({ flags: ["ip_match"] })
    .where("affiliate_id", "=", priya.id)
    .execute();

  await approveDueCommissions(flow.database, {
    now: new Date(Date.now() + 29 * DAY),
  });
  assert.equal((await ledger(rahul.id))[0]!.status, "pending");

  await approveDueCommissions(flow.database, {
    now: new Date(Date.now() + 31 * DAY),
  });
  assert.equal((await ledger(rahul.id))[0]!.status, "approved");
  assert.deepEqual(await balances(rahul.id), { pending: 0, available: 80_000 });
  assert.equal((await ledger(priya.id))[0]!.status, "pending");
});

await test("a buyer with the affiliate's own email apart from dots and a +tag is flagged for review", async () => {
  const rahul = await affiliate();
  const course = await createCourse(flow, { pricing: "paid", price: 4_000 });
  const [local, domain] = rahul.learner.email.split("@");
  const twin = flow.visitor();
  const signedUp = await twin.signUp({
    email: `${local!.slice(0, 3)}.${local!.slice(3)}+second@${domain}`,
    username: `twin_${codeCounter}_${process.pid}`.slice(0, 30),
    displayName: "Twin",
  });
  assert.equal(signedUp.status, 201, JSON.stringify(signedUp.body));
  await visit(twin, rahul.code);
  await buyThrough(twin, [course]);

  const [row] = await ledger(rahul.id);
  assert.deepEqual(row?.flags, ["email_match"]);
  await approveDueCommissions(flow.database, {
    now: new Date(Date.now() + 31 * DAY),
  });
  assert.equal((await ledger(rahul.id))[0]!.status, "pending");
});

// --------------------------------------------------------------- refunds

await test("a full refund before approval takes the pending balance back to where it was", async () => {
  const rahul = await affiliate();
  const course = await createCourse(flow, { pricing: "paid", price: 4_000 });
  const bought = await buyThrough((await referredBuyer(rahul.code)).client, [
    course,
  ]);
  assert.deepEqual(await balances(rahul.id), { pending: 80_000, available: 0 });

  const refund = await admin.post("/v1/refunds", { orderId: bought.orderId });
  assert.equal(refund.status, 200, JSON.stringify(refund.body));

  assert.deepEqual(await balances(rahul.id), { pending: 0, available: 0 });
  const [, reversal] = await ledger(rahul.id);
  assert.equal(reversal?.kind, "reversal");
  assert.equal(reversal?.status, "pending");
});

await test("half refunded reverses half the commission; a second half reverses the rest and no more", async () => {
  const rahul = await affiliate();
  const course = await createCourse(flow, { pricing: "paid", price: 5_900 });
  const bought = await buyThrough((await referredBuyer(rahul.code)).client, [
    course,
  ]);

  await admin.post("/v1/refunds", { orderId: bought.orderId, amount: 295_000 });
  await admin.post("/v1/refunds", { orderId: bought.orderId });

  const amounts = (await ledger(rahul.id)).map((row) => row.amount);
  assert.deepEqual(amounts, [118_000, -59_000, -59_000]);
});

await test("a refund after the commission was approved takes the balance below zero; the next sale makes it up", async () => {
  const rahul = await affiliate();
  const course = await createCourse(flow, { pricing: "paid", price: 5_000 });
  const first = await buyThrough((await referredBuyer(rahul.code)).client, [
    course,
  ]);
  await approveDueCommissions(flow.database, {
    now: new Date(Date.now() + 31 * DAY),
  });
  // Marked as in a paid payout (the payout pages come later).
  const payout = await flow.database
    .insertInto("affiliate_payouts")
    .values({
      affiliate_id: rahul.id,
      status: "paid",
      currency: "INR",
      gross_amount: 100_000,
      net_amount: 100_000,
      payout_method: "upi",
      payout_details_encrypted: "x",
      requested_by: "admin",
      reference: "UTR1",
      paid_on: "2026-11-20",
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  await flow.database
    .updateTable("affiliate_commissions")
    .set({ payout_id: payout.id, paid_at: new Date() })
    .where("affiliate_id", "=", rahul.id)
    .execute();

  await admin.post("/v1/refunds", { orderId: first.orderId });
  assert.deepEqual(await balances(rahul.id), {
    pending: 0,
    available: -100_000,
  });

  const bigger = await createCourse(flow, { pricing: "paid", price: 7_500 });
  await buyThrough((await referredBuyer(rahul.code)).client, [bigger]);
  await approveDueCommissions(flow.database, {
    now: new Date(Date.now() + 31 * DAY),
  });
  assert.deepEqual(await balances(rahul.id), { pending: 0, available: 50_000 });
});

await test("a refund that keeps the learner's access still reverses the commission", async () => {
  const rahul = await affiliate();
  const course = await createCourse(flow, { pricing: "paid", price: 4_000 });
  const bought = await buyThrough((await referredBuyer(rahul.code)).client, [
    course,
  ]);
  const refund = await admin.post("/v1/refunds", {
    orderId: bought.orderId,
    preserveAccess: true,
  });
  assert.equal(refund.status, 200, JSON.stringify(refund.body));
  assert.deepEqual(
    (await ledger(rahul.id)).map((row) => row.amount),
    [80_000, -80_000],
  );
});

await test("a refund the gateway settles later is reversed when it settles, and only once", async () => {
  const rahul = await affiliate();
  const course = await createCourse(flow, { pricing: "paid", price: 4_000 });
  const bought = await buyThrough((await referredBuyer(rahul.code)).client, [
    course,
  ]);
  flow.gateway.nextRefund("pending");
  await admin.post("/v1/refunds", { orderId: bought.orderId });
  assert.equal((await ledger(rahul.id)).length, 1, "nothing until it settles");

  const [gatewayRefund] = flow.gateway.refundsOf(bought.gatewayPaymentId);
  flow.gateway.settleRefund(gatewayRefund!.gatewayRefundId);
  await createRefundReconciliationWorker({
    database: flow.database,
    paymentGateways: fakePaymentGateways(flow.gateway),
    logger: silentLogger,
    staleAfterMinutes: 0,
  }).reconcileStaleRefunds();
  const refund = await flow.database
    .selectFrom("refunds")
    .select("id")
    .where("order_id", "=", bought.orderId)
    .executeTakeFirstOrThrow();
  // Delivered again (a repeated webhook, a second worker): nothing more.
  await flow.database
    .transaction()
    .execute((trx) =>
      recordRefundReversals(trx, { refundId: refund.id, now: new Date() }),
    );

  assert.deepEqual(
    (await ledger(rahul.id)).map((row) => row.amount),
    [80_000, -80_000],
  );
});

await test("a commission's amount can never be changed or deleted in the database", async () => {
  const rahul = await affiliate();
  const course = await createCourse(flow, { pricing: "paid", price: 4_000 });
  await buyThrough((await referredBuyer(rahul.code)).client, [course]);
  const [row] = await ledger(rahul.id);

  await assert.rejects(
    flow.database
      .updateTable("affiliate_commissions")
      .set({ amount: 1 })
      .where("id", "=", row!.id)
      .execute(),
    /never change/u,
  );
  await assert.rejects(
    flow.database
      .deleteFrom("affiliate_commissions")
      .where("id", "=", row!.id)
      .execute(),
    /never deleted/u,
  );
});

// --------------------------------------------------------------- failure

await test("when writing the commission fails, the payment still completes and the daily repair writes it", async () => {
  const rahul = await affiliate();
  const course = await createCourse(flow, { pricing: "paid", price: 4_000 });
  const { client, userId } = await referredBuyer(rahul.code);

  const hidden = `affiliate_commission_rules_hidden_${crypto.randomUUID().slice(0, 8)}`;
  await flow.database.schema
    .alterTable("affiliate_commission_rules")
    .renameTo(hidden)
    .execute();
  let bought: Bought;
  try {
    bought = await buyThrough(client, [course]);
  } finally {
    await flow.database.schema
      .alterTable(hidden)
      .renameTo("affiliate_commission_rules")
      .execute();
  }
  const enrolled = await flow.database
    .selectFrom("enrollments")
    .select("status")
    .where("user_id", "=", userId)
    .where("course_id", "=", course.id)
    .executeTakeFirst();
  assert.equal(enrolled?.status, "active", "the buyer has the course");
  assert.deepEqual(await ledger(rahul.id), []);

  const repaired = await reconcileCommissions(flow.database);
  assert.ok(repaired.salesRepaired >= 1);
  const rows = await ledger(rahul.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.order_id, bought.orderId);
});

await flow.close();
