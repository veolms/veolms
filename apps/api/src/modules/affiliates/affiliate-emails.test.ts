import assert from "node:assert/strict";
import { test } from "node:test";

import { createNotificationIntents } from "../notifications/notifications.handlers.ts";
import { renderNotificationTemplate } from "../notifications/notifications.templates.ts";
import {
  codeFromName,
  maskBuyer,
  payoutHint,
} from "./affiliate-account.service.ts";

const AFFILIATE = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const ADMIN = "33333333-3333-4333-8333-333333333333";
const OTHER = "44444444-4444-4444-8444-444444444444";

const events: [string, Record<string, unknown>][] = [
  [
    "affiliate.application_received",
    { affiliateId: AFFILIATE, applicantName: "Rahul Verma", code: "RAHUL" },
  ],
  [
    "affiliate.status_changed",
    {
      affiliateId: AFFILIATE,
      recipientUserId: USER,
      status: "approved",
      code: "RAHUL",
      reason: null,
    },
  ],
  [
    "affiliate.status_changed",
    {
      affiliateId: AFFILIATE,
      recipientUserId: USER,
      status: "rejected",
      code: "RAHUL",
      reason: "No audience yet",
    },
  ],
  [
    "affiliate.commission_earned",
    {
      affiliateId: AFFILIATE,
      recipientUserId: USER,
      orderId: OTHER,
      amount: 100000,
      currency: "INR",
      holdDays: 30,
    },
  ],
  [
    "affiliate.commission_reversed",
    {
      affiliateId: AFFILIATE,
      recipientUserId: USER,
      refundId: OTHER,
      amount: 50000,
      currency: "INR",
    },
  ],
  [
    "affiliate.payout_requested",
    {
      payoutId: OTHER,
      affiliateId: AFFILIATE,
      affiliateCode: "RAHUL",
      amount: 240000,
      currency: "INR",
    },
  ],
  [
    "affiliate.payout_decided",
    {
      payoutId: OTHER,
      recipientUserId: USER,
      status: "paid",
      amount: 240000,
      currency: "INR",
      reference: "UTR123",
      reason: null,
    },
  ],
  [
    "affiliate.payout_decided",
    {
      payoutId: OTHER,
      recipientUserId: USER,
      status: "failed",
      amount: 240000,
      currency: "INR",
      reference: null,
      reason: "Wrong IFSC",
    },
  ],
];

await test("every affiliate event becomes a transactional email with a readable message", async () => {
  for (const [type, payload] of events) {
    const intents = await createNotificationIntents(type, payload as never, {
      listActiveCourseRecipientUserIds: async () => [],
      listPermissionHolderUserIds: async () => [ADMIN],
    });
    assert.ok(intents.length >= 1, type);
    for (const intent of intents) {
      assert.equal(intent.category, "transactional", type);
      assert.ok(intent.channels.includes("email"), type);
      const rendered = renderNotificationTemplate(
        intent.templateKey,
        intent.templateData,
        intent.deepLink,
        { name: "Demo Academy", logoUrl: null },
      );
      assert.ok(rendered.inApp.title.length > 0, type);
      assert.doesNotMatch(rendered.inApp.body, /undefined|NaN|\[object/u, type);
      assert.ok(rendered.email.subject.length > 0, type);
    }
  }
});

await test("staff emails go to whoever holds the right permission; the affiliate's go to the affiliate", async () => {
  const asked: string[] = [];
  const deps = {
    listActiveCourseRecipientUserIds: async () => [],
    listPermissionHolderUserIds: async (key: string) => {
      asked.push(key);
      return [ADMIN];
    },
  };
  const application = await createNotificationIntents(
    "affiliate.application_received",
    events[0]![1] as never,
    deps,
  );
  const payout = await createNotificationIntents(
    "affiliate.payout_requested",
    events[5]![1] as never,
    deps,
  );
  assert.deepEqual(asked, ["affiliate.manage", "affiliate.payout"]);
  assert.equal(application[0]?.recipientUserId, ADMIN);
  assert.equal(payout[0]?.recipientUserId, ADMIN);
  const earned = await createNotificationIntents(
    "affiliate.commission_earned",
    events[3]![1] as never,
    deps,
  );
  assert.equal(earned[0]?.recipientUserId, USER);
});

await test("a buyer is shown as a first name and a masked email, never more", () => {
  assert.equal(
    maskBuyer("Asha Rao", "asha.rao@gmail.com"),
    "Asha (a••••@gmail.com)",
  );
  assert.equal(maskBuyer(null, "x@y.in"), "x••••@y.in");
  assert.equal(maskBuyer(null, null), null);
});

await test("payout details are shown only as a hint", () => {
  assert.equal(
    payoutHint({ method: "upi", upiId: "rahul.verma@okhdfc", pan: null }),
    "UPI r••••@okhdfc",
  );
  assert.equal(
    payoutHint({
      method: "bank",
      holderName: "Rahul Verma",
      accountNumber: "001234567890",
      ifsc: "HDFC0001234",
      pan: null,
    }),
    "A/c ••••7890",
  );
});

await test("a code is suggested from the name: letters and digits, lower case", () => {
  assert.equal(codeFromName("Rahul Verma"), "rahulverma");
  assert.equal(codeFromName("Zoë"), "zoe");
  assert.equal(codeFromName("A"), "aaff");
  assert.equal(codeFromName("Śrī Rāmakṛṣṇa Paramahaṃsa"), "sriramakrsna");
});
