/**
 * The affiliate's own side (Affiliate management system PRD, FR-1 and FR-9
 * to FR-11): joining the program, the dashboard, payout details and asking
 * for a payout. The admin side (approving, paying) comes later; where a test
 * needs it, the database stands in for the admin.
 */
// The flow environment is set before anything reads the API's config.
import "./setup/flow-env.ts";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test } from "node:test";

import { createPlatformSettingsService } from "../../src/modules/platform/index.ts";
import { approveDueCommissions } from "../../src/modules/affiliates/affiliate-commissions.service.ts";
import {
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
  },
  null,
);
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

interface Me {
  status: string;
  code: string;
  link: string;
  balances: Record<string, { amountMinor: number }>;
  payoutDetails: {
    method: string;
    hint: string;
    panLast4: string | null;
  } | null;
  canRequestPayout: boolean;
  payoutBlockedReason: string | null;
}

let counter = 0;
const uniqueCode = () => `p${process.pid % 10000}x${++counter}`;

function apply(client: FlowClient, body: Record<string, unknown> = {}) {
  return client.post<Me>("/v1/affiliate/apply", { acceptTerms: true, ...body });
}

async function approve(userId: string) {
  await flow.database
    .updateTable("affiliates")
    .set({ status: "approved", decided_at: new Date() })
    .where("user_id", "=", userId)
    .execute();
}

/** An approved affiliate with one sale through their link, approved and owed. */
async function affiliateWithEarnings(
  price = 5_000,
  beforeSale?: (client: FlowClient) => Promise<unknown>,
) {
  const person = await signedUpLearner(flow, "earner");
  const code = uniqueCode();
  const applied = await apply(person.client, { code });
  assert.equal(applied.status, 200, JSON.stringify(applied.body));
  await approve(person.userId);
  await beforeSale?.(person.client);
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
  const paid = flow.gateway.pay(order.body.data!.gateway.gatewayOrderId);
  const verified = await buyer.client.post("/v1/payments/verify", {
    orderId: order.body.data!.order.id,
    gatewayOrderId: order.body.data!.gateway.gatewayOrderId,
    ...paid,
  });
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  await approveDueCommissions(flow.database, {
    now: new Date(Date.now() + 31 * DAY),
  });
  return { ...person, code, buyer };
}

function setUpi(client: FlowClient, pan: string | null = "ABCDE1234F") {
  return client.request<Me>("PUT", "/v1/affiliate/me/payout-details", {
    method: "upi",
    upiId: "rahul.verma@okhdfc",
    pan,
  });
}

function requestPayout(client: FlowClient, key = crypto.randomUUID()) {
  return client.request<{
    id: string;
    status: string;
    gross: { amountMinor: number };
  }>("POST", "/v1/affiliate/me/payouts", undefined, { "idempotency-key": key });
}

async function outboxEvents(type: string, contains: string) {
  const rows = await flow.database
    .selectFrom("outbox_events")
    .select(["event_type", "payload"])
    .where("event_type", "=", type)
    .execute();
  return rows.filter((row) => JSON.stringify(row.payload).includes(contains));
}

// ---------------------------------------------------------------- joining

await test("a learner applies and waits for review; admins are told; once approved the dashboard shows their link and code", async () => {
  const { client, userId } = await signedUpLearner(flow, "applicant");
  const code = uniqueCode();

  const applied = await apply(client, {
    code,
    applicationNote: "YouTube channel, 20k subscribers",
  });
  assert.equal(applied.status, 200, JSON.stringify(applied.body));
  assert.equal(applied.body.data?.status, "pending");
  assert.equal(applied.body.data?.code, code.toUpperCase());
  assert.equal(
    (await outboxEvents("affiliate.application_received", code.toUpperCase()))
      .length,
    1,
  );

  await approve(userId);
  const me = await client.get<Me>("/v1/affiliate/me");
  assert.equal(me.status, 200);
  assert.equal(me.body.data?.status, "approved");
  assert.match(
    me.body.data!.link,
    new RegExp(`\\?ref=${code.toUpperCase()}$`, "u"),
  );
});

await test("applying twice returns the same record", async () => {
  const { client, userId } = await signedUpLearner(flow, "twice");
  const code = uniqueCode();
  await apply(client, { code });
  const again = await apply(client, { code: uniqueCode() });
  assert.equal(again.status, 200);
  assert.equal(again.body.data?.code, code.toUpperCase());
  const rows = await flow.database
    .selectFrom("affiliates")
    .select("id")
    .where("user_id", "=", userId)
    .execute();
  assert.equal(rows.length, 1);
});

await test("a code already used by an affiliate or by a coupon is refused with suggestions", async () => {
  const first = await signedUpLearner(flow, "first");
  const taken = uniqueCode();
  await apply(first.client, { code: taken });
  const second = await signedUpLearner(flow, "second");

  const clash = await apply(second.client, { code: taken });
  assert.equal(clash.status, 409);
  assert.equal(clash.body.error?.code, "CODE_TAKEN");
  assert.match(clash.body.error?.message ?? "", /Try /u);

  const couponCode = `CPN${process.pid}X${++counter}`;
  const made = await admin.post("/v1/coupons", {
    code: couponCode,
    discountType: "percentage",
    discountValue: 10,
    startsAt: new Date(Date.now() - DAY).toISOString(),
    expiresAt: new Date(Date.now() + 30 * DAY).toISOString(),
  });
  assert.equal(made.status, 200, JSON.stringify(made.body));
  const couponClash = await apply(second.client, {
    code: couponCode.toLowerCase(),
  });
  assert.equal(couponClash.status, 409);
  assert.equal(couponClash.body.error?.code, "CODE_TAKEN");
});

await test("by invitation only: an uninvited learner is refused; an invited one is approved on accepting", async () => {
  await settings.updateAffiliateProgramSettings(
    { joinMode: "invite_only" },
    null,
  );
  try {
    const stranger = await signedUpLearner(flow, "stranger");
    const refused = await apply(stranger.client);
    assert.equal(refused.status, 403);
    assert.equal(refused.body.error?.code, "PROGRAM_CLOSED");

    const invitee = await signedUpLearner(flow, "invitee");
    const code = uniqueCode();
    await flow.database
      .insertInto("affiliates")
      .values({ invited_email: invitee.learner.email.toLowerCase(), code })
      .execute();
    const accepted = await apply(invitee.client);
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    assert.equal(accepted.body.data?.status, "approved");
    assert.equal(accepted.body.data?.code, code.toUpperCase());
  } finally {
    await settings.updateAffiliateProgramSettings(
      { joinMode: "open_with_approval" },
      null,
    );
  }
});

await test("with automatic approval and a buyer discount, the code becomes a coupon at once", async () => {
  await settings.updateAffiliateProgramSettings(
    { joinMode: "open_auto_approve", buyerDiscountPercent: 10 },
    null,
  );
  try {
    const { client, userId } = await signedUpLearner(flow, "auto");
    const code = uniqueCode();
    const applied = await apply(client, { code });
    assert.equal(applied.body.data?.status, "approved");
    const coupon = await flow.database
      .selectFrom("coupons")
      .select(["id", "discount_value", "is_active"])
      .where("code", "=", code.toUpperCase())
      .executeTakeFirstOrThrow();
    assert.equal(coupon.discount_value, 10);
    const affiliate = await flow.database
      .selectFrom("affiliates")
      .select("coupon_id")
      .where("user_id", "=", userId)
      .executeTakeFirstOrThrow();
    assert.equal(affiliate.coupon_id, coupon.id);
    assert.equal(
      (await outboxEvents("affiliate.status_changed", userId)).length,
      1,
    );
  } finally {
    await settings.updateAffiliateProgramSettings(
      { joinMode: "open_with_approval", buyerDiscountPercent: 0 },
      null,
    );
  }
});

await test("the code can be changed while pending, and never after approval", async () => {
  const { client, userId } = await signedUpLearner(flow, "changer");
  await apply(client, { code: uniqueCode() });
  const newer = uniqueCode();
  const changed = await client.request<Me>("PATCH", "/v1/affiliate/me", {
    code: newer,
  });
  assert.equal(changed.body.data?.code, newer.toUpperCase());

  await approve(userId);
  const locked = await client.request("PATCH", "/v1/affiliate/me", {
    code: uniqueCode(),
  });
  assert.equal(locked.status, 409);
  assert.equal(locked.body.error?.code, "CODE_LOCKED");
});

await test("a rejected applicant sees the reason and may apply again only after 30 days", async () => {
  const { client, userId } = await signedUpLearner(flow, "rejected");
  await apply(client, { code: uniqueCode() });
  await flow.database
    .updateTable("affiliates")
    .set({
      status: "rejected",
      status_reason: "No audience yet",
      decided_at: new Date(),
    })
    .where("user_id", "=", userId)
    .execute();

  const me = await client.get<Me & { statusReason: string }>(
    "/v1/affiliate/me",
  );
  assert.equal(me.body.data?.statusReason, "No audience yet");
  const tooSoon = await apply(client);
  assert.equal(tooSoon.status, 409);
  assert.equal(tooSoon.body.error?.code, "REAPPLY_TOO_SOON");

  await flow.database
    .updateTable("affiliates")
    .set({ decided_at: new Date(Date.now() - 31 * DAY) })
    .where("user_id", "=", userId)
    .execute();
  const again = await apply(client);
  assert.equal(again.body.data?.status, "pending");
});

await test("with the program off, nobody can apply", async () => {
  await settings.updateAffiliateProgramSettings({ enabled: false }, null);
  try {
    const { client } = await signedUpLearner(flow, "late");
    const refused = await apply(client);
    assert.equal(refused.status, 403);
    assert.equal(refused.body.error?.code, "PROGRAM_CLOSED");
  } finally {
    await settings.updateAffiliateProgramSettings({ enabled: true }, null);
  }
});

await test("someone who never joined gets 404 from the dashboard, and a visitor 401", async () => {
  const { client } = await signedUpLearner(flow, "outsider");
  const me = await client.get("/v1/affiliate/me");
  assert.equal(me.status, 404);
  assert.equal(me.body.error?.code, "NOT_AN_AFFILIATE");
  assert.equal((await flow.visitor().get("/v1/affiliate/me")).status, 401);
});

// ------------------------------------------------------ payout details

await test("payout details are stored encrypted and only a hint is ever sent back", async () => {
  const { client, userId } = await signedUpLearner(flow, "details");
  await apply(client, { code: uniqueCode() });

  const saved = await setUpi(client);
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.deepEqual(saved.body.data?.payoutDetails, {
    method: "upi",
    hint: "UPI r••••@okhdfc",
    panLast4: "234F",
  });
  assert.doesNotMatch(
    JSON.stringify(saved.body),
    /rahul\.verma@okhdfc|ABCDE1234F/u,
  );
  const row = await flow.database
    .selectFrom("affiliates")
    .select(["payout_details_encrypted", "pan_encrypted"])
    .where("user_id", "=", userId)
    .executeTakeFirstOrThrow();
  assert.match(row.payout_details_encrypted!, /^v1:/u);
  assert.doesNotMatch(row.payout_details_encrypted!, /okhdfc/u);
  assert.doesNotMatch(row.pan_encrypted!, /ABCDE/u);

  const badIfsc = await client.request(
    "PUT",
    "/v1/affiliate/me/payout-details",
    {
      method: "bank",
      holderName: "Rahul Verma",
      accountNumber: "001234567890",
      ifsc: "HDFC1234",
      pan: null,
    },
  );
  assert.equal(badIfsc.status, 400);
});

// ---------------------------------------------------------------- payouts

await test("a payout request below the minimum, or without payout details, is refused with the right code", async () => {
  const small = await affiliateWithEarnings(1_000);
  await setUpi(small.client);
  const below = await requestPayout(small.client);
  assert.equal(below.status, 422);
  assert.equal(below.body.error?.code, "BELOW_MINIMUM_PAYOUT");

  const noDetails = await affiliateWithEarnings(5_000);
  const missing = await requestPayout(noDetails.client);
  assert.equal(missing.status, 422);
  assert.equal(missing.body.error?.code, "PAYOUT_DETAILS_MISSING");
});

await test("a request makes one payout holding exactly the approved rows; a second is refused; the same key returns the same payout", async () => {
  const rahul = await affiliateWithEarnings(5_000);
  await setUpi(rahul.client);
  const before = await rahul.client.get<Me>("/v1/affiliate/me");
  assert.equal(before.body.data?.balances.available?.amountMinor, 100_000);
  assert.equal(before.body.data?.canRequestPayout, true);

  const key = crypto.randomUUID();
  const made = await requestPayout(rahul.client, key);
  assert.equal(made.status, 201, JSON.stringify(made.body));
  assert.equal(made.body.data?.status, "requested");
  assert.equal(made.body.data?.gross.amountMinor, 100_000);

  const replay = await requestPayout(rahul.client, key);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.data?.id, made.body.data?.id);

  const second = await requestPayout(rahul.client);
  assert.equal(second.status, 409);
  assert.equal(second.body.error?.code, "PAYOUT_ALREADY_OPEN");

  const after = await rahul.client.get<Me>("/v1/affiliate/me");
  assert.equal(after.body.data?.balances.available?.amountMinor, 0);
  assert.equal(after.body.data?.balances.inPayout?.amountMinor, 100_000);
  assert.equal(after.body.data?.payoutBlockedReason, "payout_open");
  const tied = await flow.database
    .selectFrom("affiliate_commissions")
    .select("payout_id")
    .where("payout_id", "=", made.body.data!.id)
    .execute();
  assert.equal(tied.length, 1);
  assert.equal(
    (await outboxEvents("affiliate.payout_requested", made.body.data!.id))
      .length,
    1,
  );

  const payouts = await rahul.client.get<{ items: { id: string }[] }>(
    "/v1/affiliate/me/payouts",
  );
  assert.deepEqual(
    payouts.body.data?.items.map((payout) => payout.id),
    [made.body.data!.id],
  );
});

await test("two payout requests at once: one wins", async () => {
  const rahul = await affiliateWithEarnings(5_000);
  await setUpi(rahul.client);
  const [a, b] = await Promise.all([
    requestPayout(rahul.client),
    requestPayout(rahul.client),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [201, 409]);
});

await test("payout details cannot be removed while a payout is open", async () => {
  const rahul = await affiliateWithEarnings(5_000);
  await setUpi(rahul.client);
  await requestPayout(rahul.client);
  const removed = await rahul.client.delete("/v1/affiliate/me/payout-details");
  assert.equal(removed.status, 409);
  assert.equal(removed.body.error?.code, "PAYOUT_ALREADY_OPEN");
});

// --------------------------------------------------------------- history

await test("the history lists every row with the buyer masked; its total equals the dashboard's", async () => {
  const rahul = await affiliateWithEarnings(5_000);
  const history = await rahul.client.get<{
    items: {
      kind: string;
      buyer: string;
      product: string;
      amount: { amountMinor: number };
      source: string;
    }[];
    nextCursor: string | null;
  }>("/v1/affiliate/me/commissions");
  assert.equal(history.status, 200, JSON.stringify(history.body));
  const [row] = history.body.data!.items;
  assert.equal(row?.kind, "sale");
  assert.equal(row?.source, "link");
  assert.match(row!.buyer, /^Flow \(b••••@flow\.test\)$/u);
  assert.doesNotMatch(
    JSON.stringify(history.body),
    new RegExp(rahul.buyer.learner.email, "u"),
  );
  const me = await rahul.client.get<Me>("/v1/affiliate/me");
  const total = history.body.data!.items.reduce(
    (sum, item) => sum + item.amount.amountMinor,
    0,
  );
  assert.equal(total, me.body.data?.balances.available?.amountMinor);
});

await test("stats count the click, the sale and what it earned", async () => {
  const rahul = await affiliateWithEarnings(5_000);
  const stats = await rahul.client.get<{
    clicks: number;
    sales: number;
    earned: { amountMinor: number };
    byProduct: { sales: number }[];
  }>("/v1/affiliate/me/stats");
  assert.equal(stats.status, 200, JSON.stringify(stats.body));
  assert.equal(stats.body.data?.clicks, 1);
  assert.equal(stats.body.data?.sales, 1);
  assert.equal(stats.body.data?.earned.amountMinor, 100_000);
  assert.equal(stats.body.data?.byProduct[0]?.sales, 1);
});

await test("the commission email is queued with the sale, and not when the affiliate switched it off", async () => {
  const rahul = await affiliateWithEarnings(5_000);
  assert.equal(
    (await outboxEvents("affiliate.commission_earned", rahul.userId)).length,
    1,
  );
  const quiet = await affiliateWithEarnings(5_000, (client) =>
    client.request("PATCH", "/v1/affiliate/me", { notifyOnCommission: false }),
  );
  const earned = await flow.database
    .selectFrom("affiliate_commissions as c")
    .innerJoin("affiliates as a", "a.id", "c.affiliate_id")
    .select("c.id")
    .where("a.user_id", "=", quiet.userId)
    .execute();
  assert.equal(earned.length, 1, "the sale still earned");
  assert.equal(
    (await outboxEvents("affiliate.commission_earned", quiet.userId)).length,
    0,
  );
});

await flow.close();
