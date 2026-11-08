import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test } from "node:test";

import {
  ANDROID_NOTIFICATION_CHANNELS,
  OPTIONAL_NOTIFICATION_TYPES,
  PUSH_ROUTES,
} from "@veolms/contracts";

import {
  classifyFcmError,
  createFcmClient,
  createServiceAccountAssertion,
} from "./fcm.client.ts";
import { parsePushApps, type ServiceAccount } from "./push-apps.ts";
import { buildFcmMessage, type PushPayload } from "./push-message.ts";
import {
  chatPushDeliveries,
  notificationPushDelivery,
} from "./push-payloads.ts";

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const account: ServiceAccount = {
  projectId: "veolms-test",
  clientEmail: "push@veolms-test.iam.gserviceaccount.com",
  privateKey,
  tokenUri: "https://oauth.test/token",
};
const now = new Date("2026-11-08T10:00:00Z");
const fid = "cXk7Hb3sR2mZ8a1bC4dE5f";

const notificationPayload: PushPayload = {
  v: 1,
  kind: "notification",
  title: "Payment failed",
  body: "Order 1042 could not be charged.",
  androidChannelId: "purchases",
  importance: "DEFAULT",
  collapseKey: null,
  threadId: "account",
  androidDataOnly: false,
  data: { notificationId: "n1", deepLink: "/orders" },
};

await test("every pushed type uses a channel the app creates", () => {
  const ids = new Set(ANDROID_NOTIFICATION_CHANNELS.map((c) => c.id));
  for (const [type, route] of Object.entries(PUSH_ROUTES)) {
    assert.ok(
      ids.has(route.androidChannelId),
      `${type} → ${route.androidChannelId}`,
    );
  }
  for (const channel of ANDROID_NOTIFICATION_CHANNELS) {
    assert.match(
      channel.id,
      /^[a-z][a-z0-9_]*$/u,
      "channel ids are snake_case",
    );
  }
});

await test("every type a user can switch off is pushed, except chat mentions", () => {
  for (const type of OPTIONAL_NOTIFICATION_TYPES) {
    if (type === "chat.mentioned") continue;
    assert.ok(PUSH_ROUTES[type], `${type} has no push route`);
  }
  assert.equal(PUSH_ROUTES["chat.mentioned"], undefined);
});

await test("an Android notification names its channel and the 7.x priority", () => {
  const { message } = buildFcmMessage({
    payload: notificationPayload,
    fid,
    platform: "android",
    targetField: "fid",
    expiresAt: new Date(now.getTime() + 3600_000),
    now,
  });
  assert.equal(message.fid, fid);
  assert.equal(message.apns, undefined);
  const android = message.android as {
    priority: string;
    ttl: string;
    notification: Record<string, string>;
  };
  assert.equal(android.priority, "NORMAL");
  assert.equal(android.ttl, "3600s");
  assert.equal(android.notification.channel_id, "purchases");
  assert.equal(android.notification.notification_priority, "PRIORITY_DEFAULT");
  const data = message.data as Record<string, string>;
  assert.equal(data.deepLink, "/orders");
  assert.equal(data.kind, "notification");
  for (const value of Object.values(data)) assert.equal(typeof value, "string");
});

await test("a chat message is data-only on Android, high priority", () => {
  const { message } = buildFcmMessage({
    payload: {
      ...notificationPayload,
      kind: "chat_message",
      androidChannelId: "chat_messages",
      importance: "HIGH",
      androidDataOnly: true,
      threadId: "chat:r1",
    },
    fid,
    platform: "android",
    targetField: "token",
    expiresAt: new Date(now.getTime() + 60_000),
    now,
  });
  assert.equal(message.token, fid, "falls back to the token field when set");
  const android = message.android as Record<string, unknown>;
  assert.equal(android.priority, "HIGH");
  assert.equal(android.notification, undefined);
});

await test("iOS gets an alert stacked per thread", () => {
  const { message } = buildFcmMessage({
    payload: { ...notificationPayload, collapseKey: "learning.reminder" },
    fid,
    platform: "ios",
    targetField: "fid",
    expiresAt: new Date(now.getTime() + 60_000),
    now,
  });
  assert.equal(message.android, undefined);
  const apns = message.apns as {
    headers: Record<string, string>;
    payload: { aps: { "thread-id": string; alert: { title: string } } };
  };
  assert.equal(apns.payload.aps["thread-id"], "account");
  assert.equal(apns.payload.aps.alert.title, "Payment failed");
  assert.equal(apns.headers["apns-collapse-id"], "learning.reminder");
  assert.equal(apns.headers["apns-priority"], "5");
});

await test("Firebase errors map to what happens to the install", () => {
  const fcmError = (errorCode: string, message = "x") => ({
    error: {
      message,
      status: errorCode,
      details: [
        {
          "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError",
          errorCode,
        },
      ],
    },
  });
  assert.equal(
    classifyFcmError(404, fcmError("UNREGISTERED"), undefined).kind,
    "dead",
  );
  assert.equal(
    classifyFcmError(403, fcmError("SENDER_ID_MISMATCH"), undefined).kind,
    "dead",
  );
  assert.equal(
    classifyFcmError(
      400,
      fcmError(
        "INVALID_ARGUMENT",
        "The registration token is not a valid FCM registration token",
      ),
      undefined,
    ).kind,
    "dead",
  );
  assert.equal(
    classifyFcmError(
      400,
      fcmError("INVALID_ARGUMENT", "Invalid value at 'message.android.ttl'"),
      undefined,
    ).kind,
    "bad_message",
  );
  const quota = classifyFcmError(429, fcmError("QUOTA_EXCEEDED"), 5_000);
  assert.equal(quota.kind, "retry");
  assert.equal(
    quota.retryAfterMs,
    60_000,
    "at least a minute after a rate limit",
  );
  assert.equal(
    classifyFcmError(503, fcmError("UNAVAILABLE"), 2_000).retryAfterMs,
    2_000,
  );
  assert.equal(
    classifyFcmError(401, fcmError("THIRD_PARTY_AUTH_ERROR"), undefined).kind,
    "auth",
  );
  assert.equal(
    classifyFcmError(401, null, undefined).kind,
    "retry",
    "a stale token is retried",
  );
  assert.equal(classifyFcmError(500, null, undefined).kind, "retry");
});

await test("the sign-in assertion is a JWT signed with the service key", () => {
  const jwt = createServiceAccountAssertion(account, 1_800_000_000);
  const [header, claims, signature] = jwt.split(".");
  const verified = crypto
    .createVerify("RSA-SHA256")
    .update(`${header}.${claims}`)
    .verify(publicKey, Buffer.from(signature!, "base64url"));
  assert.ok(verified);
  const body = JSON.parse(Buffer.from(claims!, "base64url").toString());
  assert.equal(body.iss, account.clientEmail);
  assert.equal(body.aud, account.tokenUri);
  assert.equal(
    body.scope,
    "https://www.googleapis.com/auth/firebase.messaging",
  );
  assert.equal(body.exp - body.iat, 3600);
});

await test("the client signs in once and reuses the token", async () => {
  const calls: string[] = [];
  const fetchImpl = (async (url: string) => {
    calls.push(url);
    if (url === account.tokenUri) {
      return Response.json({ access_token: "at-1", expires_in: 3600 });
    }
    return Response.json({ name: "projects/veolms-test/messages/1" });
  }) as typeof fetch;
  const client = createFcmClient({ endpoint: "https://fcm.test", fetchImpl });
  const body = { message: { fid } };
  const [a, b] = await Promise.all([
    client.send(account, body),
    client.send(account, body),
  ]);
  assert.deepEqual(a, {
    ok: true,
    messageId: "projects/veolms-test/messages/1",
  });
  assert.ok(b.ok);
  assert.equal(calls.filter((url) => url === account.tokenUri).length, 1);
  assert.equal(
    calls.filter(
      (url) => url === "https://fcm.test/v1/projects/veolms-test/messages:send",
    ).length,
    2,
  );
});

await test("a refused key pauses the app instead of failing the push", async () => {
  const fetchImpl = (async () =>
    Response.json(
      { error: "invalid_grant" },
      { status: 400 },
    )) as unknown as typeof fetch;
  const client = createFcmClient({ fetchImpl });
  const outcome = await client.send(account, { message: { fid } });
  assert.equal(outcome.ok, false);
  assert.equal(!outcome.ok && outcome.kind, "auth");
});

await test("PUSH_APPS: base64 keys, broken entries and bad JSON", () => {
  const key = Buffer.from(
    JSON.stringify({
      project_id: "p1",
      client_email: "a@p1.iam.gserviceaccount.com",
      private_key: privateKey,
    }),
  ).toString("base64");
  const apps = parsePushApps(
    JSON.stringify([
      { applicationId: "com.procodrr.app", serviceAccountBase64: key },
      {
        applicationId: "org.veolms.app",
        serviceAccountPath: "/nowhere/key.json",
      },
    ]),
  );
  assert.ok(apps.configured);
  assert.equal(apps.get("com.procodrr.app")?.serviceAccount?.projectId, "p1");
  assert.equal(
    apps.get("com.procodrr.app")?.serviceAccount?.tokenUri,
    "https://oauth2.googleapis.com/token",
  );
  const broken = apps.get("org.veolms.app");
  assert.equal(
    broken?.serviceAccount,
    null,
    "a missing key file keeps the app, without a key",
  );
  assert.match(broken?.problem ?? "", /could not be read/u);
  assert.equal(apps.get("com.other.app"), undefined);

  const bad = parsePushApps("{not json");
  assert.equal(bad.configured, false);
  assert.match(bad.problem ?? "", /PUSH_APPS/u);
  assert.equal(parsePushApps(undefined).configured, false);
});

await test("a notification push carries its route, expiry and dedupe key", () => {
  const push = notificationPushDelivery({
    notificationId: "11111111-1111-4111-8111-111111111111",
    recipientUserId: "u1",
    type: "learning.reminder",
    category: "learning",
    title: "Keep your streak",
    body: "Ten minutes today keeps it going.",
    deepLink: "/",
    now,
  })!;
  const payload = push.payload as unknown as PushPayload;
  assert.equal(
    push.dedupeKey,
    "notification:11111111-1111-4111-8111-111111111111",
  );
  assert.equal(payload.androidChannelId, "study_reminders");
  assert.equal(payload.collapseKey, "learning.reminder");
  assert.equal(push.expiresAt.getTime() - now.getTime(), 24 * 3600 * 1000);
  assert.equal(
    notificationPushDelivery({
      ...{
        notificationId: "n",
        recipientUserId: "u",
        category: "social",
        title: "t",
        body: "b",
        deepLink: null,
        now,
      },
      type: "chat.mentioned",
    }),
    null,
    "chat mentions are pushed as the chat message itself",
  );
});

await test("chat pushes read like WhatsApp: sender in a group, name in a private chat", () => {
  const base = {
    roomId: "r1",
    roomTitle: "JavaScript course",
    messageId: "m1",
    seq: 42,
    senderId: "s1",
    senderName: "Asha",
    text: "Is the quiz open?",
    sentAt: now,
    isRequest: false,
    recipients: [
      { userId: "u1", isMention: true, unreadCount: 3 },
      { userId: "u2", isMention: false, unreadCount: 250 },
      { userId: "u3", isMention: false, unreadCount: 1 },
    ],
  };
  const group = chatPushDeliveries(
    { ...base, roomKind: "course" },
    new Set(["u1", "u2"]),
    now,
  );
  assert.equal(group.length, 2, "only users with a phone");
  const first = group[0]!.payload as unknown as PushPayload;
  assert.equal(first.title, "JavaScript course");
  assert.equal(first.body, "Asha: Is the quiz open?");
  assert.equal(first.androidDataOnly, true);
  assert.equal(first.androidChannelId, "chat_messages");
  assert.equal(first.threadId, "chat:r1");
  assert.equal(first.data.isMention, "true");
  assert.equal(first.data.seq, "42");
  assert.equal(first.data.deepLink, "/chat/r1?seq=42");
  assert.equal(
    (group[1]!.payload as unknown as PushPayload).data.unreadCount,
    "99",
  );
  assert.equal(group[0]!.dedupeKey, "chat:m1:u1");

  const direct = chatPushDeliveries(
    { ...base, roomKind: "direct", roomTitle: "Asha", isRequest: true },
    new Set(["u1"]),
    now,
  );
  const payload = direct[0]!.payload as unknown as PushPayload;
  assert.equal(payload.title, "Asha (message request)");
  assert.equal(payload.body, "Is the quiz open?");
});
