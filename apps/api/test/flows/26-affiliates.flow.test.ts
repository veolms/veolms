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
  const response = await flow
    .visitor()
    .get<{
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

await flow.close();
