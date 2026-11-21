/**
 * The affiliate program's edges (Affiliate management system PRD, sections
 * 15 and 16): an account deleted or closed, payout details kept no longer
 * than they are needed, the split between managing affiliates and paying
 * them, purchases that earn nothing, and the health numbers.
 */
// The flow environment is set before anything reads the API's config.
import "./setup/flow-env.ts";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test } from "node:test";

import {
  approveDueCommissions,
  purgeOldPayoutDetails,
  readAffiliateHealth,
  suspendClosedAccounts,
} from "../../src/modules/affiliates/affiliate-commissions.service.ts";
import { createPlatformSettingsService } from "../../src/modules/platform/index.ts";
import {
  signedInAdmin,
  signedUpLearner,
  startFlowApp,
} from "./setup/flow-app.ts";
import type { FlowClient } from "./setup/flow-app.ts";
import { createCourse, enrollForFree } from "./setup/flow-courses.ts";

const flow = await startFlowApp();
const admin = await signedInAdmin(flow);
const settings = createPlatformSettingsService({ database: flow.database });
const DAY = 24 * 60 * 60 * 1000;
const BROWSER =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

// Through the admin's route, which also gives the program its default rate.
const programOn = await admin.request("PUT", "/v1/affiliates/settings", {
  enabled: true,
  joinMode: "open_with_approval",
  buyerDiscountPercent: 0,
  minPayoutMinor: 50_000,
  tdsEnabled: false,
});
assert.equal(programOn.status, 200, JSON.stringify(programOn.body));

let counter = 0;
const uniqueCode = () => `h${process.pid % 10000}z${++counter}`;

async function approvedAffiliate(label = "edge") {
  const person = await signedUpLearner(flow, label);
  const code = uniqueCode();
  const applied = await person.client.post("/v1/affiliate/apply", {
    acceptTerms: true,
    code,
  });
  assert.equal(applied.status, 200, JSON.stringify(applied.body));
  const row = await flow.database
    .selectFrom("affiliates")
    .select("id")
    .where("user_id", "=", person.userId)
    .executeTakeFirstOrThrow();
  const approved = await admin.post(`/v1/affiliates/${row.id}/approve`);
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  return { ...person, code, affiliateId: row.id };
}

async function clickAs(client: FlowClient, code: string) {
  await client.request(
    "POST",
    "/v1/affiliate/clicks",
    { code },
    { "user-agent": BROWSER },
  );
}

async function buyThrough(code: string, price = 5_000) {
  const course = await createCourse(flow, { pricing: "paid", price });
  const buyer = await signedUpLearner(flow, "buyer");
  await clickAs(buyer.client, code);
  const order = await buyer.client.post<{
    order: { id: string };
    gateway: { gatewayOrderId: string };
  }>("/v1/checkout/orders", {
    items: [{ itemType: "course", courseId: course.id }],
  });
  const paid = flow.gateway.pay(order.body.data!.gateway.gatewayOrderId);
  const verified = await buyer.client.post("/v1/payments/verify", {
    orderId: order.body.data!.order.id,
    gatewayOrderId: order.body.data!.gateway.gatewayOrderId,
    ...paid,
  });
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
}

async function withUpi(client: FlowClient) {
  const saved = await client.request("PUT", "/v1/affiliate/me/payout-details", {
    method: "upi",
    upiId: "rahul.verma@okhdfc",
    pan: "ABCDE1234F",
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
}

function affiliateRow(id: string) {
  return flow.database
    .selectFrom("affiliates")
    .select([
      "status",
      "status_reason",
      "user_id",
      "coupon_id",
      "payout_details_encrypted",
      "pan_encrypted",
    ])
    .where("id", "=", id)
    .executeTakeFirstOrThrow();
}

// ------------------------------------------------------ accounts

await test("deleting an affiliate's account suspends them, switches their coupon off and keeps their ledger", async () => {
  await settings.updateAffiliateProgramSettings(
    { buyerDiscountPercent: 10 },
    null,
  );
  try {
    const person = await approvedAffiliate("deleted");
    await buyThrough(person.code);
    const before = await affiliateRow(person.affiliateId);
    assert.ok(before.coupon_id, "the coupon exists");

    // Its sessions and codes go with it; the affiliate record stays.
    await flow.database
      .deleteFrom("users")
      .where("id", "=", person.userId)
      .execute();

    const after = await affiliateRow(person.affiliateId);
    assert.equal(after.user_id, null);
    assert.equal(after.status, "suspended");
    assert.match(after.status_reason ?? "", /deleted/u);
    const coupon = await flow.database
      .selectFrom("coupons")
      .select("is_active")
      .where("id", "=", before.coupon_id!)
      .executeTakeFirstOrThrow();
    assert.equal(coupon.is_active, false);
    const ledger = await flow.database
      .selectFrom("affiliate_commissions")
      .select("id")
      .where("affiliate_id", "=", person.affiliateId)
      .execute();
    assert.equal(ledger.length, 1, "the commission is kept");
  } finally {
    await settings.updateAffiliateProgramSettings(
      { buyerDiscountPercent: 0 },
      null,
    );
  }
});

await test("an affiliate whose account was closed is suspended by the daily work, their pending commissions held", async () => {
  const person = await approvedAffiliate("closed");
  await buyThrough(person.code);
  await flow.database
    .updateTable("users")
    .set({ is_deleted: true })
    .where("id", "=", person.userId)
    .execute();

  assert.ok((await suspendClosedAccounts(flow.database)) >= 1);
  const row = await affiliateRow(person.affiliateId);
  assert.equal(row.status, "suspended");
  assert.match(row.status_reason ?? "", /closed/u);
  const commissions = await flow.database
    .selectFrom("affiliate_commissions")
    .select(["status", "flags"])
    .where("affiliate_id", "=", person.affiliateId)
    .execute();
  assert.deepEqual(
    commissions.map((c) => [c.status, c.flags]),
    [["pending", ["affiliate_suspended"]]],
  );
  // Nothing more the second time.
  await suspendClosedAccounts(flow.database);
  assert.equal((await affiliateRow(person.affiliateId)).status, "suspended");
});

// ------------------------------------------------------ retention

await test("a rejected applicant's payout details are deleted", async () => {
  const person = await signedUpLearner(flow, "rejectee");
  await person.client.post("/v1/affiliate/apply", {
    acceptTerms: true,
    code: uniqueCode(),
  });
  await withUpi(person.client);
  const row = await flow.database
    .selectFrom("affiliates")
    .select("id")
    .where("user_id", "=", person.userId)
    .executeTakeFirstOrThrow();
  const rejected = await admin.post(`/v1/affiliates/${row.id}/reject`, {
    reason: "Not a fit for the program",
  });
  assert.equal(rejected.status, 200, JSON.stringify(rejected.body));
  const after = await affiliateRow(row.id);
  assert.equal(after.payout_details_encrypted, null);
  assert.equal(after.pan_encrypted, null);
});

await test("payout details are deleted after 24 months with no payout and no commission, never while a payout is open", async () => {
  const idle = await approvedAffiliate("idle");
  await withUpi(idle.client);
  const busy = await approvedAffiliate("busy");
  await withUpi(busy.client);
  const waiting = await approvedAffiliate("waiting");
  await buyThrough(waiting.code);
  await approveDueCommissions(flow.database, {
    now: new Date(Date.now() + 31 * DAY),
  });
  await withUpi(waiting.client);
  const asked = await waiting.client.request(
    "POST",
    "/v1/affiliate/me/payouts",
    undefined,
    { "idempotency-key": crypto.randomUUID() },
  );
  assert.equal(asked.status, 201, JSON.stringify(asked.body));

  // All three joined long ago; busy and waiting earned this month.
  const longAgo = new Date(Date.now() - 800 * DAY);
  await flow.database
    .updateTable("affiliates")
    .set({ created_at: longAgo })
    .where("id", "in", [
      idle.affiliateId,
      busy.affiliateId,
      waiting.affiliateId,
    ])
    .execute();
  await buyThrough(busy.code);

  await purgeOldPayoutDetails(flow.database);
  assert.equal(
    (await affiliateRow(idle.affiliateId)).payout_details_encrypted,
    null,
  );
  assert.ok((await affiliateRow(busy.affiliateId)).payout_details_encrypted);
  assert.ok((await affiliateRow(waiting.affiliateId)).payout_details_encrypted);

  // Two and a half years on, nobody has earned since: busy's go, but
  // waiting's stay while their payout is open.
  await purgeOldPayoutDetails(flow.database, {
    now: new Date(Date.now() + 900 * DAY),
  });
  assert.equal(
    (await affiliateRow(busy.affiliateId)).payout_details_encrypted,
    null,
  );
  assert.ok(
    (await affiliateRow(waiting.affiliateId)).payout_details_encrypted,
    "kept while a payout is open",
  );
});

// ------------------------------------------------------ permissions

await test("managing affiliates without affiliate.payout: no full payout details, no payment file, no paying", async () => {
  const manager = await signedUpLearner(flow, "manager");
  const roleId = crypto.randomUUID();
  await flow.database
    .insertInto("roles")
    .values({ id: roleId, name: `affiliate_manager_${Date.now()}` })
    .execute();
  for (const key of ["affiliate.read", "affiliate.manage"]) {
    const permission = await flow.database
      .selectFrom("permissions")
      .select("id")
      .where("permission_key", "=", key)
      .executeTakeFirstOrThrow();
    await flow.database
      .insertInto("role_permissions")
      .values({
        role_id: roleId,
        permission_id: permission.id,
        effect: "allow",
      })
      .execute();
  }
  await flow.database
    .insertInto("user_roles")
    .values({ user_id: manager.userId, role_id: roleId })
    .execute();

  const person = await approvedAffiliate("paid");
  await buyThrough(person.code);
  await approveDueCommissions(flow.database, {
    now: new Date(Date.now() + 31 * DAY),
  });
  await withUpi(person.client);
  const asked = await person.client.request<{ id: string }>(
    "POST",
    "/v1/affiliate/me/payouts",
    undefined,
    { "idempotency-key": crypto.randomUUID() },
  );
  const payoutId = asked.body.data!.id;

  const list = await manager.client.get("/v1/affiliates");
  assert.equal(list.status, 200, "they can see the affiliates");
  for (const [method, url, payload] of [
    ["GET", `/v1/affiliates/${person.affiliateId}/payout-details`, undefined],
    ["GET", "/v1/affiliates/payouts/export?status=requested", undefined],
    [
      "POST",
      `/v1/affiliates/payouts/${payoutId}/mark-paid`,
      { reference: "UTR 1", paidOn: "2026-12-01" },
    ],
    ["POST", "/v1/affiliates/payouts", { allAboveMinimum: true }],
  ] as const) {
    const response = await manager.client.request(method, url, payload);
    assert.equal(response.status, 403, `${method} ${url}`);
  }

  // Whoever pays must give a reference.
  const noReference = await admin.post(
    `/v1/affiliates/payouts/${payoutId}/mark-paid`,
    {
      paidOn: "2026-12-01",
    },
  );
  assert.equal(noReference.status, 400);
});

// ------------------------------------------------------ earning nothing

await test("a free course and a course given by the academy earn nothing, even after a link", async () => {
  const person = await approvedAffiliate("nothing");
  const learner = await signedUpLearner(flow, "freebie");
  await clickAs(learner.client, person.code);

  const free = await createCourse(flow, { pricing: "free" });
  await enrollForFree(learner.client, free);
  const given = await createCourse(flow, { pricing: "paid", price: 3_000 });
  const grant = await admin.post("/v1/access/grants", {
    userId: learner.userId,
    courseId: given.id,
  });
  assert.ok(grant.status < 300, JSON.stringify(grant.body));

  const rows = await flow.database
    .selectFrom("affiliate_commissions")
    .select("id")
    .where("affiliate_id", "=", person.affiliateId)
    .execute();
  assert.equal(rows.length, 0);
});

// ------------------------------------------------------ observability

await test("the health numbers count the last hour's clicks, credit and sales, and how far approvals are behind", async () => {
  const person = await approvedAffiliate("health");
  await buyThrough(person.code);
  const health = await readAffiliateHealth(flow.database);
  assert.ok(health.clicksLastHour >= 1);
  assert.ok((health.attributionsLastHour.link ?? 0) >= 1);
  assert.ok(health.salesLastHour >= 1);

  // A sale due a day ago and still pending is a day behind.
  const later = await readAffiliateHealth(flow.database, {
    now: new Date(Date.now() + 31 * DAY),
  });
  assert.ok(
    later.approvalLagMinutes >= 24 * 60,
    String(later.approvalLagMinutes),
  );
});

await flow.close();
