/**
 * The academy admin's side of the affiliate program (Affiliate management
 * system PRD, FR-2, FR-6, FR-7, FR-11, FR-12, FR-15 and section 13.3):
 * settings and rules, approving and suspending affiliates, invitations, the
 * commission ledger, an order's attribution, payouts with TDS, reports and
 * the audit log. Everything goes through the real API.
 */
// The flow environment is set before anything reads the API's config.
import "./setup/flow-env.ts";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test } from "node:test";

import {
  approveDueCommissions,
  remindOverduePayouts,
} from "../../src/modules/affiliates/affiliate-commissions.service.ts";
import { createPlatformSettingsService } from "../../src/modules/platform/index.ts";
import {
  newLearner,
  signedInAdmin,
  signedUpLearner,
  startFlowApp,
} from "./setup/flow-app.ts";
import type { FlowClient } from "./setup/flow-app.ts";
import { createCourse } from "./setup/flow-courses.ts";

const flow = await startFlowApp();
const admin = await signedInAdmin(flow);
const settings = createPlatformSettingsService({ database: flow.database });
const DAY = 24 * 60 * 60 * 1000;
const BROWSER =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

await settings.updateAffiliateProgramSettings(
  {
    enabled: true,
    joinMode: "open_with_approval",
    buyerDiscountPercent: 0,
    minPayoutMinor: 50_000,
    tdsEnabled: false,
  },
  null,
);

let counter = 0;
const uniqueCode = () => `a${process.pid % 10000}y${++counter}`;

interface Detail {
  id: string;
  code: string;
  status: string;
  statusReason: string | null;
  coupon: { code: string; active: boolean } | null;
  balances: Record<string, { amountMinor: number }>;
}

async function applicant(label = "applicant") {
  const person = await signedUpLearner(flow, label);
  const code = uniqueCode();
  const applied = await person.client.post<{ status: string }>(
    "/v1/affiliate/apply",
    { acceptTerms: true, code },
  );
  assert.equal(applied.status, 200, JSON.stringify(applied.body));
  const row = await flow.database
    .selectFrom("affiliates")
    .select("id")
    .where("user_id", "=", person.userId)
    .executeTakeFirstOrThrow();
  return { ...person, code, affiliateId: row.id };
}

async function approved(label = "affiliate") {
  const person = await applicant(label);
  const response = await admin.post<Detail>(
    `/v1/affiliates/${person.affiliateId}/approve`,
  );
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return person;
}

/** A paid order bought through the affiliate's link; returns its id. */
async function saleThrough(code: string, price = 5_000) {
  const course = await createCourse(flow, { pricing: "paid", price });
  const buyer = await signedUpLearner(flow, "buyer");
  await buyer.client.request(
    "POST",
    "/v1/affiliate/clicks",
    { code },
    { "user-agent": BROWSER },
  );
  const order = await buyer.client.post<{
    order: { id: string };
    gateway: { gatewayOrderId: string };
  }>("/v1/checkout/orders", {
    items: [{ itemType: "course", courseId: course.id }],
  });
  assert.equal(order.status, 200, JSON.stringify(order.body));
  const paid = flow.gateway.pay(order.body.data!.gateway.gatewayOrderId);
  const verified = await buyer.client.post("/v1/payments/verify", {
    orderId: order.body.data!.order.id,
    gatewayOrderId: order.body.data!.gateway.gatewayOrderId,
    ...paid,
  });
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  return { orderId: order.body.data!.order.id, buyer };
}

function commissionsOf(affiliateId: string) {
  return flow.database
    .selectFrom("affiliate_commissions")
    .select([
      "id",
      "kind",
      "status",
      "flags",
      "amount",
      "payout_id",
      "paid_at",
      "note",
    ])
    .where("affiliate_id", "=", affiliateId)
    .orderBy("created_at")
    .execute();
}

async function withUpi(client: FlowClient, pan: string | null = "ABCDE1234F") {
  const saved = await client.request("PUT", "/v1/affiliate/me/payout-details", {
    method: "upi",
    upiId: "rahul.verma@okhdfc",
    pan,
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
}

/** An approved affiliate owed ₹1,000 (one ₹5,000 sale at 20%), with UPI. */
async function owedAffiliate() {
  const person = await approved("owed");
  await saleThrough(person.code);
  await approveDueCommissions(flow.database, {
    now: new Date(Date.now() + 31 * DAY),
  });
  await withUpi(person.client);
  return person;
}

async function auditActions(subjectId: string) {
  const rows = await flow.database
    .selectFrom("affiliate_audit_log")
    .select("action")
    .where("subject_id", "=", subjectId)
    .execute();
  return rows.map((row) => row.action);
}

async function outboxCount(type: string, contains: string) {
  const rows = await flow.database
    .selectFrom("outbox_events")
    .select("payload")
    .where("event_type", "=", type)
    .execute();
  return rows.filter((row) => JSON.stringify(row.payload).includes(contains))
    .length;
}

// ---------------------------------------------------------------- access

await test("the admin routes need the permission: a learner gets 403 and a visitor 401", async () => {
  const { client } = await signedUpLearner(flow, "nosy");
  for (const path of [
    "/v1/affiliates",
    "/v1/affiliates/settings",
    "/v1/affiliates/payouts",
    "/v1/affiliates/commissions",
  ]) {
    assert.equal((await client.get(path)).status, 403, path);
    assert.equal((await flow.visitor().get(path)).status, 401, path);
  }
});

// ------------------------------------------------------ settings, rules

await test("switching the program on adds the 20% default rate when there is none", async () => {
  await flow.database
    .updateTable("affiliate_commission_rules")
    .set({ archived_at: new Date() })
    .where("affiliate_id", "is", null)
    .where("target_type", "is", null)
    .where("archived_at", "is", null)
    .execute();
  await settings.updateAffiliateProgramSettings({ enabled: false }, null);

  const saved = await admin.request<{
    settings: { enabled: boolean };
    defaultRule: { rateType: string; rateValue: number } | null;
  }>("PUT", "/v1/affiliates/settings", { enabled: true });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.data?.settings.enabled, true);
  assert.deepEqual(
    {
      rateType: saved.body.data?.defaultRule?.rateType,
      rateValue: saved.body.data?.defaultRule?.rateValue,
    },
    { rateType: "percent", rateValue: 2000 },
  );
  const audit = await flow.database
    .selectFrom("affiliate_audit_log")
    .select("data")
    .where("action", "=", "program.settings_changed")
    .orderBy("created_at", "desc")
    .executeTakeFirstOrThrow();
  assert.deepEqual(audit.data.enabled, { from: false, to: true });
});

await test("a rule is replaced, never edited; the default can't be removed; a product rule can", async () => {
  const course = await createCourse(flow, { pricing: "paid", price: 4_000 });
  const first = await admin.request<{ id: string; targetTitle: string | null }>(
    "PUT",
    "/v1/affiliates/rules",
    {
      affiliateId: null,
      targetType: "course",
      targetId: course.id,
      rateType: "percent",
      rateValue: 3000,
      currency: null,
    },
  );
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.data?.targetTitle, course.title);
  const second = await admin.request<{ id: string }>(
    "PUT",
    "/v1/affiliates/rules",
    {
      affiliateId: null,
      targetType: "course",
      targetId: course.id,
      rateType: "fixed",
      rateValue: 50_000,
      currency: "INR",
    },
  );
  const old = await flow.database
    .selectFrom("affiliate_commission_rules")
    .select(["archived_at", "rate_value"])
    .where("id", "=", first.body.data!.id)
    .executeTakeFirstOrThrow();
  assert.ok(old.archived_at, "the first rule is archived");
  assert.equal(old.rate_value, 3000, "and unchanged");

  const listed = await admin.get<{ items: { id: string }[] }>(
    "/v1/affiliates/rules",
  );
  const ids = listed.body.data!.items.map((rule) => rule.id);
  assert.ok(ids.includes(second.body.data!.id));
  assert.ok(!ids.includes(first.body.data!.id));

  const settingsView = await admin.get<{ defaultRule: { id: string } }>(
    "/v1/affiliates/settings",
  );
  const removeDefault = await admin.request(
    "DELETE",
    `/v1/affiliates/rules/${settingsView.body.data!.defaultRule.id}`,
  );
  assert.equal(removeDefault.status, 409);
  assert.equal(removeDefault.body.error?.code, "DEFAULT_RULE");
  const removed = await admin.request(
    "DELETE",
    `/v1/affiliates/rules/${second.body.data!.id}`,
  );
  assert.equal(removed.status, 200);
});

// ------------------------------------------------------ affiliates

await test("an application is found by code, approved (email sent) or rejected with a reason the applicant sees", async () => {
  const person = await applicant("reviewed");
  const found = await admin.get<{ items: { id: string; status: string }[] }>(
    `/v1/affiliates?status=pending&q=${person.code}`,
  );
  assert.deepEqual(
    found.body.data?.items.map((row) => row.id),
    [person.affiliateId],
  );

  const noReason = await admin.post(
    `/v1/affiliates/${person.affiliateId}/reject`,
    {},
  );
  assert.equal(noReason.status, 422);
  assert.equal(noReason.body.error?.code, "REASON_REQUIRED");

  const reason = `No audience yet (${person.code})`;
  const rejected = await admin.post<Detail>(
    `/v1/affiliates/${person.affiliateId}/reject`,
    { reason },
  );
  assert.equal(rejected.body.data?.status, "rejected");
  const me = await person.client.get<{ statusReason: string }>(
    "/v1/affiliate/me",
  );
  assert.equal(me.body.data?.statusReason, reason);
  assert.equal(await outboxCount("affiliate.status_changed", reason), 1);

  const again = await admin.post(
    `/v1/affiliates/${person.affiliateId}/approve`,
  );
  assert.equal(again.status, 409);
  assert.equal(again.body.error?.code, "STATUS_CHANGED");

  const other = await applicant("approvee");
  const ok = await admin.post<Detail>(
    `/v1/affiliates/${other.affiliateId}/approve`,
  );
  assert.equal(ok.body.data?.status, "approved");
  assert.deepEqual(await auditActions(other.affiliateId), [
    "affiliate.approved",
  ]);
});

await test("an invitation is emailed; signing up with that address and accepting approves it", async () => {
  const invitee = newLearner("invited");
  const code = uniqueCode();
  const invited = await admin.post<Detail & { invitedEmail: string }>(
    "/v1/affiliates/invitations",
    { email: invitee.email.toUpperCase(), code },
  );
  assert.equal(invited.status, 201, JSON.stringify(invited.body));
  assert.equal(invited.body.data?.status, "pending");
  assert.equal(invited.body.data?.invitedEmail, invitee.email.toLowerCase());
  const mail = flow.email.sent.findLast(
    (sent) => sent.to === invitee.email.toLowerCase(),
  );
  assert.ok(mail, "the invitation was emailed");
  assert.match(mail.text, new RegExp(code.toUpperCase(), "u"));
  assert.match(mail.text, /\/affiliates\/join/u);

  const twice = await admin.post("/v1/affiliates/invitations", {
    email: invitee.email,
  });
  assert.equal(twice.status, 409);
  assert.equal(twice.body.error?.code, "ALREADY_INVITED");

  const notYet = await admin.post(
    `/v1/affiliates/${invited.body.data!.id}/approve`,
  );
  assert.equal(notYet.body.error?.code, "INVITATION_NOT_ACCEPTED");

  const client = flow.visitor();
  assert.equal((await client.signUp(invitee)).status, 201);
  const accepted = await client.post<{ status: string; code: string }>(
    "/v1/affiliate/apply",
    { acceptTerms: true },
  );
  assert.equal(accepted.body.data?.status, "approved");
  assert.equal(accepted.body.data?.code, code.toUpperCase());
});

await test("a withdrawn (rejected) invitation can't be accepted", async () => {
  const invitee = newLearner("withdrawn");
  const invited = await admin.post<Detail>("/v1/affiliates/invitations", {
    email: invitee.email,
  });
  await admin.post(`/v1/affiliates/${invited.body.data!.id}/reject`, {
    reason: "Sent to the wrong person",
  });
  const client = flow.visitor();
  await client.signUp(invitee);
  const applied = await client.post<{ status: string }>("/v1/affiliate/apply", {
    acceptTerms: true,
  });
  assert.equal(applied.body.data?.status, "pending", "an ordinary application");
});

await test("suspending stops tracking, switches the coupon off and holds pending commissions; reinstating undoes it", async () => {
  await settings.updateAffiliateProgramSettings(
    { buyerDiscountPercent: 10 },
    null,
  );
  try {
    const person = await approved("suspended");
    await saleThrough(person.code);
    const before = await admin.get<Detail>(
      `/v1/affiliates/${person.affiliateId}`,
    );
    assert.deepEqual(before.body.data?.coupon, {
      code: person.code.toUpperCase(),
      active: true,
    });

    const suspended = await admin.post<Detail>(
      `/v1/affiliates/${person.affiliateId}/suspend`,
      { reason: "Bidding on our name in ads" },
    );
    assert.equal(suspended.body.data?.status, "suspended");
    assert.equal(suspended.body.data?.coupon?.active, false);
    const held = await commissionsOf(person.affiliateId);
    assert.deepEqual(held[0]?.flags, ["affiliate_suspended"]);

    const clicksBefore = await flow.database
      .selectFrom("affiliate_clicks")
      .select("id")
      .where("affiliate_id", "=", person.affiliateId)
      .execute();
    const visitor = flow.visitor();
    const click = await visitor.request(
      "POST",
      "/v1/affiliate/clicks",
      { code: person.code },
      { "user-agent": BROWSER },
    );
    assert.ok(click.status < 300, "the same answer as for any code");
    const clicksAfter = await flow.database
      .selectFrom("affiliate_clicks")
      .select("id")
      .where("affiliate_id", "=", person.affiliateId)
      .execute();
    assert.equal(clicksAfter.length, clicksBefore.length, "no click recorded");

    const reinstated = await admin.post<Detail>(
      `/v1/affiliates/${person.affiliateId}/reinstate`,
    );
    assert.equal(reinstated.body.data?.status, "approved");
    assert.equal(reinstated.body.data?.coupon?.active, true);
    assert.deepEqual((await commissionsOf(person.affiliateId))[0]?.flags, []);
  } finally {
    await settings.updateAffiliateProgramSettings(
      { buyerDiscountPercent: 0 },
      null,
    );
  }
});

await test("changing the buyer discount changes every affiliate's coupon, and zero switches them off", async () => {
  const person = await approved("discounted");
  const on = await admin.request("PUT", "/v1/affiliates/settings", {
    buyerDiscountPercent: 15,
  });
  assert.equal(on.status, 200);
  const coupon = await flow.database
    .selectFrom("coupons")
    .select(["discount_value", "is_active"])
    .where("code", "=", person.code.toUpperCase())
    .executeTakeFirstOrThrow();
  assert.deepEqual(coupon, { discount_value: 15, is_active: true });

  await admin.request("PUT", "/v1/affiliates/settings", {
    buyerDiscountPercent: 0,
  });
  const off = await flow.database
    .selectFrom("coupons")
    .select("is_active")
    .where("code", "=", person.code.toUpperCase())
    .executeTakeFirstOrThrow();
  assert.equal(off.is_active, false);
});

// ------------------------------------------------------ commissions

await test("a flagged commission waits; the admin can approve it early or reject it with a reason", async () => {
  const person = await approved("flagged");
  await saleThrough(person.code);
  await saleThrough(person.code);
  const rows = await commissionsOf(person.affiliateId);
  await flow.database
    .updateTable("affiliate_commissions")
    .set({ flags: ["ip_match"] })
    .where(
      "id",
      "in",
      rows.map((row) => row.id),
    )
    .execute();

  const listed = await admin.get<{ items: { id: string; flags: string[] }[] }>(
    `/v1/affiliates/commissions?flagged=true&affiliateId=${person.affiliateId}`,
  );
  assert.equal(listed.body.data?.items.length, 2);

  const early = await admin.post<{ status: string }>(
    `/v1/affiliates/commissions/${rows[0]!.id}/approve`,
  );
  assert.equal(early.status, 200, JSON.stringify(early.body));
  assert.equal(early.body.data?.status, "approved");

  const rejected = await admin.post<{ status: string; note: string }>(
    `/v1/affiliates/commissions/${rows[1]!.id}/reject`,
    { reason: "Bought from the affiliate's own office network" },
  );
  assert.equal(rejected.body.data?.status, "rejected");
  assert.match(rejected.body.data!.note, /own office/u);

  const twice = await admin.post(
    `/v1/affiliates/commissions/${rows[1]!.id}/approve`,
  );
  assert.equal(twice.status, 409);
  assert.equal(twice.body.error?.code, "COMMISSION_NOT_PENDING");

  const detail = await admin.get<Detail>(
    `/v1/affiliates/${person.affiliateId}`,
  );
  assert.equal(detail.body.data?.balances.available?.amountMinor, 100_000);
});

await test("an adjustment is owed at once, plus or minus, and needs a note", async () => {
  const person = await approved("adjusted");
  const plus = await admin.post<{ kind: string; status: string }>(
    "/v1/affiliates/commissions/adjustments",
    {
      affiliateId: person.affiliateId,
      amountMinor: 25_000,
      note: "Bonus for the launch week",
    },
  );
  assert.equal(plus.status, 201, JSON.stringify(plus.body));
  assert.deepEqual(
    { kind: plus.body.data?.kind, status: plus.body.data?.status },
    { kind: "adjustment", status: "approved" },
  );
  await admin.post("/v1/affiliates/commissions/adjustments", {
    affiliateId: person.affiliateId,
    amountMinor: -5_000,
    note: "Correction of the bonus",
  });
  const noNote = await admin.post("/v1/affiliates/commissions/adjustments", {
    affiliateId: person.affiliateId,
    amountMinor: 100,
    note: "",
  });
  assert.equal(noNote.status, 400);
  const detail = await admin.get<Detail>(
    `/v1/affiliates/${person.affiliateId}`,
  );
  assert.equal(detail.body.data?.balances.available?.amountMinor, 20_000);
});

await test("an order is credited to another affiliate while pending: the old rows are rejected, new ones written; locked once approved", async () => {
  const first = await approved("credited");
  const second = await approved("recredited");
  const { orderId } = await saleThrough(first.code);

  const moved = await admin.request<{ commissions: number }>(
    "PUT",
    `/v1/affiliates/orders/${orderId}/attribution`,
    {
      affiliateId: second.affiliateId,
      note: "The buyer named the second affiliate",
    },
  );
  assert.equal(moved.status, 200, JSON.stringify(moved.body));
  assert.equal(moved.body.data?.commissions, 1);
  assert.deepEqual(
    (await commissionsOf(first.affiliateId)).map((row) => row.status),
    ["rejected"],
  );
  assert.deepEqual(
    (await commissionsOf(second.affiliateId)).map((row) => row.status),
    ["pending"],
  );
  const attribution = await flow.database
    .selectFrom("affiliate_order_attributions")
    .select(["affiliate_id", "source", "changed_by"])
    .where("order_id", "=", orderId)
    .executeTakeFirstOrThrow();
  assert.equal(attribution.affiliate_id, second.affiliateId);
  assert.equal(attribution.source, "manual");
  assert.ok(attribution.changed_by);

  await approveDueCommissions(flow.database, {
    now: new Date(Date.now() + 31 * DAY),
  });
  const locked = await admin.request(
    "PUT",
    `/v1/affiliates/orders/${orderId}/attribution`,
    {
      affiliateId: null,
    },
  );
  assert.equal(locked.status, 409);
  assert.equal(locked.body.error?.code, "COMMISSIONS_LOCKED");
});

await test("an affiliate can't be credited with their own purchase", async () => {
  const person = await approved("selfish");
  const other = await approved("honest");
  const { orderId } = await saleThrough(other.code);
  // The buyer becomes an affiliate, then the order is moved to them.
  const order = await flow.database
    .selectFrom("orders")
    .select("user_id")
    .where("id", "=", orderId)
    .executeTakeFirstOrThrow();
  await flow.database
    .updateTable("affiliates")
    .set({ user_id: order.user_id })
    .where("id", "=", person.affiliateId)
    .execute();
  const refused = await admin.request(
    "PUT",
    `/v1/affiliates/orders/${orderId}/attribution`,
    {
      affiliateId: person.affiliateId,
    },
  );
  assert.equal(refused.status, 422);
  assert.equal(refused.body.error?.code, "SELF_REFERRAL");
});

// ------------------------------------------------------ payouts

await test("an open payout is marked paid once: its rows are paid, the affiliate is told; a repeat is a no-op, another reference 409", async () => {
  const person = await owedAffiliate();
  const requested = await person.client.request<{ id: string }>(
    "POST",
    "/v1/affiliate/me/payouts",
    undefined,
    { "idempotency-key": crypto.randomUUID() },
  );
  assert.equal(requested.status, 201, JSON.stringify(requested.body));
  const payoutId = requested.body.data!.id;

  const listed = await admin.get<{
    items: { id: string; affiliate: { code: string } }[];
  }>(
    `/v1/affiliates/payouts?status=requested&affiliateId=${person.affiliateId}`,
  );
  assert.equal(listed.body.data?.items[0]?.id, payoutId);
  assert.equal(
    listed.body.data?.items[0]?.affiliate.code,
    person.code.toUpperCase(),
  );

  const body = {
    reference: "UTR 433112908877",
    paidOn: "2026-12-21",
    note: "UPI from HDFC",
  };
  const paid = await admin.post<{
    status: string;
    net: { amountMinor: number };
  }>(`/v1/affiliates/payouts/${payoutId}/mark-paid`, body);
  assert.equal(paid.status, 200, JSON.stringify(paid.body));
  assert.equal(paid.body.data?.status, "paid");
  assert.equal(paid.body.data?.net.amountMinor, 100_000);
  assert.ok(
    (await commissionsOf(person.affiliateId)).every((row) => row.paid_at),
  );
  assert.equal(await outboxCount("affiliate.payout_decided", payoutId), 1);

  const repeat = await admin.post(
    `/v1/affiliates/payouts/${payoutId}/mark-paid`,
    body,
  );
  assert.equal(repeat.status, 200);
  const other = await admin.post(
    `/v1/affiliates/payouts/${payoutId}/mark-paid`,
    {
      ...body,
      reference: "UTR 999",
    },
  );
  assert.equal(other.status, 409);
  assert.equal(other.body.error?.code, "PAYOUT_NOT_OPEN");

  const me = await person.client.get<{
    balances: Record<string, { amountMinor: number }>;
  }>("/v1/affiliate/me");
  assert.equal(me.body.data?.balances.paid?.amountMinor, 100_000);
  assert.equal(me.body.data?.balances.available?.amountMinor, 0);
});

await test("a rejected or failed payout gives its rows back, and the affiliate can ask again", async () => {
  const person = await owedAffiliate();
  const ask = () =>
    person.client.request<{ id: string }>(
      "POST",
      "/v1/affiliate/me/payouts",
      undefined,
      {
        "idempotency-key": crypto.randomUUID(),
      },
    );
  const first = await ask();
  const rejected = await admin.post<{ status: string }>(
    `/v1/affiliates/payouts/${first.body.data!.id}/reject`,
    { reason: "PAN does not match the name" },
  );
  assert.equal(rejected.body.data?.status, "rejected");
  assert.ok(
    (await commissionsOf(person.affiliateId)).every(
      (row) => row.payout_id === null,
    ),
  );

  const second = await ask();
  assert.equal(second.status, 201);
  const failed = await admin.post<{ status: string }>(
    `/v1/affiliates/payouts/${second.body.data!.id}/fail`,
    { reason: "The UPI id bounced" },
  );
  assert.equal(failed.body.data?.status, "failed");
  const me = await person.client.get<{
    balances: Record<string, { amountMinor: number }>;
  }>("/v1/affiliate/me");
  assert.equal(me.body.data?.balances.available?.amountMinor, 100_000);
});

await test("with TDS on, an open payout suggests TDS from the year's total, and marking paid stores gross, TDS and net", async () => {
  await settings.updateAffiliateProgramSettings({ tdsEnabled: true }, null);
  try {
    const person = await owedAffiliate();
    // ₹19,500 already paid this year: this ₹1,000 takes the year past ₹20,000.
    const today = new Date(Date.now() + 330 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    await flow.database
      .insertInto("affiliate_payouts")
      .values({
        affiliate_id: person.affiliateId,
        status: "paid",
        currency: "INR",
        gross_amount: 1_950_000,
        tds_amount: 0,
        net_amount: 1_950_000,
        payout_method: "upi",
        payout_details_encrypted: "v1:earlier",
        requested_by: "admin",
        reference: "UTR earlier",
        paid_on: today,
      })
      .execute();
    const requested = await person.client.request<{ id: string }>(
      "POST",
      "/v1/affiliate/me/payouts",
      undefined,
      { "idempotency-key": crypto.randomUUID() },
    );
    const listed = await admin.get<{
      items: {
        id: string;
        tdsSuggestion: {
          suggested: { amountMinor: number };
          crossesThreshold: boolean;
        } | null;
      }[];
    }>(
      `/v1/affiliates/payouts?status=requested&affiliateId=${person.affiliateId}`,
    );
    const suggestion = listed.body.data?.items[0]?.tdsSuggestion;
    assert.equal(suggestion?.suggested.amountMinor, 2_000, "2% of ₹1,000");
    assert.equal(suggestion?.crossesThreshold, true);

    const paid = await admin.post<{
      tds: { amountMinor: number };
      net: { amountMinor: number };
    }>(`/v1/affiliates/payouts/${requested.body.data!.id}/mark-paid`, {
      reference: "UTR 1",
      paidOn: today,
      tdsMinor: 2_500,
    });
    assert.equal(paid.body.data?.tds.amountMinor, 2_500, "the admin's figure");
    assert.equal(paid.body.data?.net.amountMinor, 97_500);
  } finally {
    await settings.updateAffiliateProgramSettings({ tdsEnabled: false }, null);
  }
});

await test("the admin creates payouts for everyone owed the minimum; those who can't be paid are listed", async () => {
  const ready = await owedAffiliate();
  const noDetails = await approved("nodetails");
  await saleThrough(noDetails.code);
  await approveDueCommissions(flow.database, {
    now: new Date(Date.now() + 31 * DAY),
  });

  const made = await admin.post<{
    created: { affiliate: { id: string }; requestedBy: string }[];
    skipped: { affiliateId: string; reason: string }[];
  }>("/v1/affiliates/payouts", { allAboveMinimum: true });
  assert.equal(made.status, 200, JSON.stringify(made.body));
  const created = made.body.data!.created.find(
    (p) => p.affiliate.id === ready.affiliateId,
  );
  assert.equal(created?.requestedBy, "admin");
  assert.deepEqual(
    made.body.data!.skipped.find((s) => s.affiliateId === noDetails.affiliateId)
      ?.reason,
    "details_missing",
  );

  const chosen = await admin.post<{ skipped: { reason: string }[] }>(
    "/v1/affiliates/payouts",
    {
      affiliateIds: [ready.affiliateId],
    },
  );
  assert.equal(chosen.body.data?.skipped[0]?.reason, "payout_open");
});

await test("full payout details and the payout CSV are for affiliate.payout holders, and every read is audited", async () => {
  const person = await owedAffiliate();
  await person.client.request("POST", "/v1/affiliate/me/payouts", undefined, {
    "idempotency-key": crypto.randomUUID(),
  });
  const details = await admin.get<{ upiId: string; pan: string }>(
    `/v1/affiliates/${person.affiliateId}/payout-details`,
  );
  assert.equal(details.status, 200, JSON.stringify(details.body));
  assert.equal(details.body.data?.upiId, "rahul.verma@okhdfc");
  assert.equal(details.body.data?.pan, "ABCDE1234F");
  assert.ok(
    (await auditActions(person.affiliateId)).includes("payout_details.viewed"),
  );

  const csv = await admin.request(
    "GET",
    "/v1/affiliates/payouts/export?status=requested",
  );
  assert.equal(csv.status, 200);
  const text =
    typeof csv.body === "string" ? csv.body : JSON.stringify(csv.body);
  assert.match(text, /rahul\.verma@okhdfc/u);
  assert.match(text, new RegExp(person.code.toUpperCase(), "u"));
  const exported = await flow.database
    .selectFrom("affiliate_audit_log")
    .select("id")
    .where("action", "=", "payouts.exported")
    .execute();
  assert.ok(exported.length >= 1);
});

await test("a payout open for over a week reminds whoever pays, at most once a week", async () => {
  const person = await owedAffiliate();
  const requested = await person.client.request<{ id: string }>(
    "POST",
    "/v1/affiliate/me/payouts",
    undefined,
    { "idempotency-key": crypto.randomUUID() },
  );
  const payoutId = requested.body.data!.id;
  await flow.database
    .updateTable("affiliate_payouts")
    .set({ created_at: new Date(Date.now() - 8 * DAY) })
    .where("id", "=", payoutId)
    .execute();
  await remindOverduePayouts(flow.database);
  await remindOverduePayouts(flow.database);
  assert.equal(await outboxCount("affiliate.payout_overdue", payoutId), 1);
});

// ------------------------------------------------------ reports, audit

await test("the overview counts attributed sales, clicks and money owed; exports are CSV", async () => {
  const person = await approved("reported");
  await saleThrough(person.code);
  const summary = await admin.get<{
    orders: number;
    clicks: number;
    affiliateSales: { amountMinor: number };
    pending: { amountMinor: number };
    topAffiliates: { code: string }[];
  }>("/v1/affiliates/reports/summary");
  assert.equal(summary.status, 200, JSON.stringify(summary.body));
  assert.ok(summary.body.data!.orders >= 1);
  assert.ok(summary.body.data!.clicks >= 1);
  assert.ok(summary.body.data!.affiliateSales.amountMinor >= 500_000);
  assert.ok(summary.body.data!.pending.amountMinor >= 100_000);

  for (const type of ["commissions", "affiliates"]) {
    const csv = await admin.request(
      "GET",
      `/v1/affiliates/reports/export?type=${type}`,
    );
    assert.equal(csv.status, 200, type);
    const text =
      typeof csv.body === "string" ? csv.body : JSON.stringify(csv.body);
    assert.match(text, new RegExp(person.code.toUpperCase(), "u"), type);
  }

  const audit = await admin.get<{
    items: { action: string; actorName: string | null }[];
  }>(`/v1/affiliates/audit?subjectId=${person.affiliateId}`);
  assert.equal(audit.body.data?.items[0]?.action, "affiliate.approved");
  assert.ok(audit.body.data?.items[0]?.actorName);
});

await flow.close();
