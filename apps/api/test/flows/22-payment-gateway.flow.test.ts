/**
 * The academy's own payment account (Platform → Payments,
 * creator-features/36-academy-payment-gateway-plan.md): only staff with
 * `payment.gateway.manage` reach it; keys are checked with Razorpay before
 * they are kept (here a stand-in answers); secrets are stored encrypted and
 * never sent back; the webhook secret is shown once; every change emails
 * the admins; removing deletes the keys.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { grantPlatformRole } from "@veolms/database";

import { SYSTEM_ROLES } from "../../../../packages/database/src/seed/rbac.ts";
import {
  signedUpLearner,
  startFlowApp,
  type FlowResponse,
} from "./setup/flow-app.ts";

const { setRazorpayKeyCheckForTests } =
  await import("../../src/modules/commerce/payments/gateways/creator-gateway.service.ts");

const flow = await startFlowApp();
const adminAccount = await signedUpLearner(flow, "payadmin");
await grantPlatformRole(flow.database, {
  userId: adminAccount.userId,
  roleId: SYSTEM_ROLES.admin.id,
});
const admin = flow.visitor();
await admin.signIn(adminAccount.learner.email);
const learner = await signedUpLearner(flow, "paylearner");
const visitor = flow.visitor();

const KEY_ID = `rzp_test_${"A1b2C3d4E5f6G7"}`;
const KEY_SECRET = "s3cretS3cretS3cretS3cret";
let acceptedKeys = true;
setRazorpayKeyCheckForTests(async () => (acceptedKeys ? "ok" : "rejected"));

interface Gateway {
  provider: string;
  connected: boolean;
  mode: "test" | "live" | null;
  keyId: string | null;
  hasWebhookSecret: boolean;
  connectedBy: string | null;
  webhookUrl: string;
  webhookEvents: string[];
}

function ok<T>(response: FlowResponse<T>, status = 200): T {
  assert.equal(
    response.status,
    status,
    `answered ${response.status}: ${JSON.stringify(response.body.error)}`,
  );
  return response.body.data as T;
}

async function razorpay(): Promise<Gateway> {
  const data = ok<{ gateways: Gateway[] }>(
    await admin.get("/v1/payments/gateway-config"),
  );
  return data.gateways.find((gateway) => gateway.provider === "razorpay")!;
}

test.after(async () => {
  setRazorpayKeyCheckForTests(null);
  await flow.database.deleteFrom("creator_payment_configs").execute();
  await flow.close();
});

test("only staff who manage the payment gateway reach the payment account", async () => {
  assert.equal((await visitor.get("/v1/payments/gateway-config")).status, 401);
  assert.equal(
    (await learner.client.get("/v1/payments/gateway-config")).status,
    403,
  );
  assert.equal(
    (
      await learner.client.put("/v1/payments/gateway-config/razorpay", {
        keyId: KEY_ID,
        keySecret: KEY_SECRET,
      })
    ).status,
    403,
  );
});

test("keys Razorpay refuses, or that don't look like keys, are not kept", async () => {
  await flow.database.deleteFrom("creator_payment_configs").execute();
  const malformed = await admin.put("/v1/payments/gateway-config/razorpay", {
    keyId: "not-a-key",
    keySecret: KEY_SECRET,
  });
  assert.equal(malformed.status, 400);

  acceptedKeys = false;
  const refused = await admin.put("/v1/payments/gateway-config/razorpay", {
    keyId: KEY_ID,
    keySecret: KEY_SECRET,
  });
  acceptedKeys = true;
  assert.equal(refused.status, 400);
  assert.equal(refused.body.error?.code, "PAYMENT_KEYS_REJECTED");
  assert.equal((await razorpay()).connected, false);
});

test("connecting keeps the keys encrypted, shows the webhook secret once and never the key secret", async () => {
  const before = flow.email.sent.length;
  const connected = ok<{ gateway: Gateway; webhookSecret: string }>(
    await admin.put("/v1/payments/gateway-config/razorpay", {
      keyId: KEY_ID,
      keySecret: KEY_SECRET,
    }),
  );
  assert.equal(connected.gateway.connected, true);
  assert.equal(connected.gateway.mode, "test");
  assert.equal(connected.gateway.keyId, `rzp_test****${KEY_ID.slice(-4)}`);
  assert.ok(
    connected.webhookSecret.length >= 24,
    "a strong webhook secret is made",
  );
  assert.match(connected.gateway.webhookUrl, /\/v1\/webhooks\/razorpay$/u);
  assert.ok(connected.gateway.webhookEvents.includes("payment.captured"));

  // Read back: masked, and no secret anywhere in the answer.
  const read = await admin.get("/v1/payments/gateway-config");
  const text = JSON.stringify(read.body);
  assert.ok(!text.includes(KEY_SECRET), "the key secret is never sent back");
  assert.ok(!text.includes(connected.webhookSecret), "nor the webhook secret");
  assert.ok(!text.includes(KEY_ID), "nor the whole key id");
  assert.equal(read.headers["cache-control"], "no-store");

  // At rest: nothing readable in the database, each value in the payment
  // keys' own format (their own encryption key, shared with nothing else).
  const row = await flow.database
    .selectFrom("creator_payment_configs")
    .selectAll()
    .executeTakeFirstOrThrow();
  for (const value of [
    row.encrypted_key_id,
    row.encrypted_key_secret,
    row.encrypted_webhook_secret ?? "",
  ]) {
    assert.ok(
      !value.includes(KEY_ID) &&
        !value.includes(KEY_SECRET) &&
        !value.includes(connected.webhookSecret),
    );
    assert.match(value, /^v1:/u, "stored in the payment keys' v1 format");
  }
  // The payment keys' encryption key opens them; the MFA key does not.
  const { decryptPaymentSecret, decryptPaymentSecretWith } =
    await import("../../src/modules/commerce/payments/gateways/payment-keys-crypto.ts");
  assert.equal(decryptPaymentSecret(row.encrypted_key_secret), KEY_SECRET);
  assert.throws(() =>
    decryptPaymentSecretWith(
      row.encrypted_key_secret,
      "flow_test_mfa_encryption_key_at_least_32_chars",
    ),
  );

  // Every admin is told.
  await new Promise((resolve) => setTimeout(resolve, 200));
  const notices = flow.email.sent
    .slice(before)
    .filter((mail) => mail.subject.includes("connected a payment account"));
  assert.ok(
    notices.some(
      (mail) => mail.to === adminAccount.learner.email.toLowerCase(),
    ),
    "the admin who connected it is emailed",
  );
});

test("a new webhook secret replaces the old one; replacing the keys keeps one account", async () => {
  const first = await flow.database
    .selectFrom("creator_payment_configs")
    .select("encrypted_webhook_secret")
    .executeTakeFirstOrThrow();
  const renewed = ok<{ webhookSecret: string }>(
    await admin.post("/v1/payments/gateway-config/razorpay/webhook-secret", {}),
  );
  const second = await flow.database
    .selectFrom("creator_payment_configs")
    .select("encrypted_webhook_secret")
    .executeTakeFirstOrThrow();
  assert.notEqual(
    first.encrypted_webhook_secret,
    second.encrypted_webhook_secret,
  );
  assert.ok(renewed.webhookSecret.length >= 24);

  const LIVE = `rzp_live_${"Z9y8X7w6V5u4T3"}`;
  const replaced = ok<{ gateway: Gateway }>(
    await admin.put("/v1/payments/gateway-config/razorpay", {
      keyId: LIVE,
      keySecret: KEY_SECRET,
    }),
  );
  assert.equal(replaced.gateway.mode, "live");
  const rows = await flow.database
    .selectFrom("creator_payment_configs")
    .select("id")
    .execute();
  assert.equal(rows.length, 1, "one account per gateway");
});

test("removing the account deletes the keys", async () => {
  const removed = ok<Gateway>(
    await admin.delete("/v1/payments/gateway-config/razorpay"),
  );
  assert.equal(removed.connected, false);
  assert.equal(
    (
      await flow.database
        .selectFrom("creator_payment_configs")
        .select("id")
        .execute()
    ).length,
    0,
  );
  assert.equal(
    (await admin.delete("/v1/payments/gateway-config/razorpay")).status,
    404,
  );
  assert.equal(
    (
      await admin.post(
        "/v1/payments/gateway-config/razorpay/webhook-secret",
        {},
      )
    ).status,
    404,
  );
});
