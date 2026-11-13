import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";

import {
  ANDROID_NOTIFICATION_CHANNELS,
  OPTIONAL_NOTIFICATION_TYPES,
  PUSH_ROUTES,
} from "@veolms/contracts";
import type { Credential } from "firebase-admin/app";

import {
  classifyAdminError,
  classifyFcmError,
  createFcmClient,
} from "./fcm.client.ts";
import { parsePushApps, type ServiceAccount } from "./push-apps.ts";
import { buildFcmMessage, type PushPayload } from "./push-message.ts";
import {
  chatPushDeliveries,
  notificationPushDelivery,
} from "./push-payloads.ts";

const { privateKey } = crypto.generateKeyPairSync("rsa", {
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

/**
 * A stand-in for Firebase on localhost: records each request the Admin SDK
 * makes and answers with the next queued reply (or a success).
 */
async function fakeFirebase() {
  const requests: { path: string; authorization: string; body: unknown }[] = [];
  const replies: {
    status: number;
    body: unknown;
    headers?: Record<string, string>;
  }[] = [];
  const server = http.createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk: Buffer) => (raw += chunk.toString("utf8")));
    request.on("end", () => {
      requests.push({
        path: request.url ?? "",
        authorization: request.headers.authorization ?? "",
        body: JSON.parse(raw || "null"),
      });
      const reply = replies.shift() ?? {
        status: 200,
        body: { name: `projects/veolms-test/messages/${requests.length}` },
      };
      response.writeHead(reply.status, {
        "content-type": "application/json",
        ...reply.headers,
      });
      response.end(JSON.stringify(reply.body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    endpoint: `http://127.0.0.1:${port}`,
    requests,
    replies,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

/** A sign-in that counts how often the SDK asks for a token. */
function countingCredential() {
  const state = { signIns: 0 };
  const credential: Credential = {
    getAccessToken: async () => {
      state.signIns += 1;
      return { access_token: `at-${state.signIns}`, expires_in: 3600 };
    },
  };
  return { state, credentialFor: () => credential };
}

const sendPath = "/v1/projects/veolms-test/messages:send";

function fcmErrorBody(errorCode: string, message = "x") {
  return {
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
  };
}

await test("the client signs in once and reuses the token", async () => {
  const firebase = await fakeFirebase();
  try {
    const { state, credentialFor } = countingCredential();
    const client = createFcmClient({
      endpoint: firebase.endpoint,
      credentialFor,
    });
    const body = { message: { fid } };
    const [a, b] = await Promise.all([
      client.send(account, body),
      client.send(account, body),
    ]);
    assert.ok(a.ok);
    assert.match(
      a.ok ? a.messageId : "",
      /^projects\/veolms-test\/messages\//u,
    );
    assert.ok(b.ok);
    assert.equal(state.signIns, 1);
    assert.equal(
      firebase.requests.filter((request) => request.path === sendPath).length,
      2,
    );
    assert.equal(firebase.requests[0]?.authorization, "Bearer at-1");
  } finally {
    await firebase.close();
  }
});

await test("the Admin SDK sends exactly the message buildFcmMessage writes", async () => {
  const firebase = await fakeFirebase();
  try {
    const client = createFcmClient({
      endpoint: firebase.endpoint,
      credentialFor: countingCredential().credentialFor,
    });
    const chat: PushPayload = {
      ...notificationPayload,
      kind: "chat_message",
      androidChannelId: "chat_messages",
      importance: "HIGH",
      androidDataOnly: true,
      collapseKey: "chat:r1",
      threadId: "chat:r1",
      data: { roomId: "r1", seq: "12", unreadCount: "3" },
    };
    const cases = [
      // Android notification, by FID (production).
      { payload: notificationPayload, platform: "android", field: "fid" },
      // Android notification with a collapse key, high priority.
      {
        payload: {
          ...notificationPayload,
          importance: "HIGH",
          collapseKey: "learning.reminder",
        },
        platform: "android",
        field: "fid",
      },
      // Android chat: data only.
      { payload: chat, platform: "android", field: "fid" },
      // Low importance, by token.
      {
        payload: { ...notificationPayload, importance: "MIN" },
        platform: "android",
        field: "token",
      },
      // iOS alert stacked per thread, with a collapse id.
      {
        payload: { ...notificationPayload, collapseKey: "learning.reminder" },
        platform: "ios",
        field: "fid",
      },
      { payload: chat, platform: "ios", field: "fid" },
    ] as const;
    for (const [index, item] of cases.entries()) {
      const built = buildFcmMessage({
        payload: item.payload as PushPayload,
        fid,
        platform: item.platform,
        targetField: item.field,
        expiresAt: new Date(now.getTime() + 3600_000),
        now,
      });
      const outcome = await client.send(account, built);
      assert.ok(outcome.ok, `case ${index}`);
      // The SDK always writes the Android priority in lower case
      // ("high", "normal"); Firebase reads both spellings the same.
      const expected = structuredClone(built) as {
        message: { android?: { priority?: string } };
      };
      if (expected.message.android?.priority) {
        expected.message.android.priority =
          expected.message.android.priority.toLowerCase();
      }
      assert.deepEqual(
        firebase.requests[index]?.body,
        expected,
        `case ${index}: same JSON on the wire`,
      );
    }
  } finally {
    await firebase.close();
  }
});

await test("Firebase's answers through the SDK keep their meaning", async () => {
  const firebase = await fakeFirebase();
  try {
    const { state, credentialFor } = countingCredential();
    const client = createFcmClient({
      endpoint: firebase.endpoint,
      credentialFor,
    });
    const send = async (reply: (typeof firebase.replies)[number]) => {
      firebase.replies.push(reply);
      const outcome = await client.send(account, { message: { fid } });
      assert.equal(outcome.ok, false);
      return outcome.ok ? null! : outcome;
    };

    const unregistered = await send({
      status: 404,
      body: fcmErrorBody("UNREGISTERED", "Requested entity was not found."),
    });
    assert.equal(unregistered.kind, "dead");
    assert.match(unregistered.error, /^UNREGISTERED: /u);

    assert.equal(
      (
        await send({
          status: 400,
          body: fcmErrorBody(
            "INVALID_ARGUMENT",
            "The registration token is not a valid FCM registration token",
          ),
        })
      ).kind,
      "dead",
      "an invalid FID",
    );
    assert.equal(
      (
        await send({
          status: 400,
          body: fcmErrorBody(
            "INVALID_ARGUMENT",
            "Invalid value at 'message.android.ttl'",
          ),
        })
      ).kind,
      "bad_message",
    );
    assert.equal(
      (await send({ status: 403, body: fcmErrorBody("SENDER_ID_MISMATCH") }))
        .kind,
      "dead",
    );
    assert.equal(
      (await send({ status: 403, body: fcmErrorBody("PERMISSION_DENIED") }))
        .kind,
      "auth",
    );
    assert.equal(
      (
        await send({
          status: 401,
          body: fcmErrorBody("THIRD_PARTY_AUTH_ERROR"),
        })
      ).kind,
      "auth",
    );

    const quota = await send({
      status: 429,
      body: fcmErrorBody("QUOTA_EXCEEDED"),
      headers: { "retry-after": "5" },
    });
    assert.equal(quota.kind, "retry");
    assert.equal(quota.retryAfterMs, 60_000, "at least a minute");

    const internal = await send({
      status: 500,
      body: fcmErrorBody("INTERNAL"),
      headers: { "retry-after": "2" },
    });
    assert.equal(internal.kind, "retry");
    assert.equal(internal.retryAfterMs, 2_000, "Retry-After is honoured");

    // A stale token: retried at once, with a fresh sign-in.
    const signInsBefore = state.signIns;
    const stale = await send({
      status: 401,
      body: fcmErrorBody("UNAUTHENTICATED"),
    });
    assert.equal(stale.kind, "retry");
    assert.equal(stale.retryAfterMs, 0);
    const next = await client.send(account, { message: { fid } });
    assert.ok(next.ok);
    assert.equal(state.signIns, signInsBefore + 1, "signed in afresh");
  } finally {
    await firebase.close();
  }
});

await test("a refused key pauses the app instead of failing the push", async () => {
  const refused: Credential = {
    getAccessToken: () =>
      Promise.reject(
        Object.assign(new Error("invalid_grant: Invalid JWT Signature."), {
          response: { status: 400, data: { error: "invalid_grant" } },
        }),
      ),
  };
  const client = createFcmClient({ credentialFor: () => refused });
  const outcome = await client.send(account, { message: { fid } });
  assert.equal(outcome.ok, false);
  assert.equal(!outcome.ok && outcome.kind, "auth");

  const unreachable: Credential = {
    getAccessToken: () =>
      Promise.reject(
        Object.assign(new Error("getaddrinfo ENOTFOUND"), {
          code: "ENOTFOUND",
        }),
      ),
  };
  const offline = await createFcmClient({
    credentialFor: () => unreachable,
  }).send(account, { message: { fid } });
  assert.equal(
    !offline.ok && offline.kind,
    "retry",
    "sign-in unreachable is retried",
  );

  // The real cert(): a private key that does not parse is retried, as
  // when signing with it threw before the SDK.
  const broken = await createFcmClient().send(
    { ...account, privateKey: "not a key" },
    { message: { fid } },
  );
  assert.equal(!broken.ok && broken.kind, "retry");
});

await test("SDK errors without an answer from Firebase", () => {
  const sdkError = (code: string) => Object.assign(new Error(code), { code });
  assert.equal(classifyAdminError(sdkError("app/network-error")).kind, "retry");
  assert.equal(
    classifyAdminError(sdkError("app/network-timeout")).kind,
    "retry",
  );
  assert.equal(
    classifyAdminError(sdkError("messaging/invalid-payload")).kind,
    "bad_message",
  );
  assert.equal(
    classifyAdminError(sdkError("messaging/installation-id-not-registered"))
      .kind,
    "dead",
  );
  const rate = classifyAdminError(sdkError("messaging/message-rate-exceeded"));
  assert.equal(rate.kind, "retry");
  assert.equal(rate.retryAfterMs, 60_000);
  assert.equal(
    classifyAdminError(sdkError("messaging/third-party-auth-error")).kind,
    "auth",
  );
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

await test("push counts as set up only when on and an app is listed", async () => {
  const { isPushConfigured } = await import("./push-pipeline.ts");
  const apps = JSON.stringify([
    { applicationId: "com.procodrr.app", serviceAccountPath: "/nowhere.json" },
  ]);
  // Web push without keys: off.
  const web = {
    WEB_PUSH_ENABLED: true,
    WEB_PUSH_VAPID_PUBLIC_KEY: undefined,
    WEB_PUSH_VAPID_PRIVATE_KEY: undefined,
    WEB_PUSH_SUBJECT: undefined,
    WEB_PUSH_ALLOWED_HOSTS: "fcm.googleapis.com",
    WEB_URL: "https://example.test",
  };
  assert.equal(
    isPushConfigured({ ...web, PUSH_ENABLED: true, PUSH_APPS: apps }),
    true,
  );
  assert.equal(
    isPushConfigured({ ...web, PUSH_ENABLED: false, PUSH_APPS: apps }),
    false,
  );
  assert.equal(
    isPushConfigured({ ...web, PUSH_ENABLED: true, PUSH_APPS: undefined }),
    false,
  );
});

const hasLoneSurrogate = (text: string) =>
  /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u.test(
    text,
  );

await test("long chat text is never cut in the middle of an emoji", () => {
  // 499 letters, then emoji: a cut by UTF-16 units lands inside one.
  const text = `${"a".repeat(498)}${"😀".repeat(10)}`;
  const [delivery] = chatPushDeliveries(
    {
      roomId: "r1",
      roomKind: "direct",
      roomTitle: "Asha",
      messageId: "m1",
      seq: 1,
      senderId: "s1",
      senderName: "Asha",
      text,
      sentAt: now,
      isRequest: false,
      recipients: [{ userId: "u1", isMention: false, unreadCount: 1 }],
    },
    new Set(["u1"]),
    now,
  );
  const payload = delivery!.payload as unknown as PushPayload;
  assert.ok(payload.data.text!.endsWith("…"));
  assert.equal(hasLoneSurrogate(payload.data.text!), false);
  assert.equal(hasLoneSurrogate(payload.body), false);
});

await test("a long non-Latin push fits FCM's 4 KB, and a notification's text is sent once", () => {
  const hindi = "नमस्ते दुनिया ".repeat(80); // 3 bytes a character
  for (const platform of ["android", "ios"] as const) {
    const { message } = buildFcmMessage({
      payload: {
        ...notificationPayload,
        title: hindi.slice(0, 200),
        body: hindi.slice(0, 1000),
      },
      fid,
      platform,
      targetField: "fid",
      expiresAt: new Date(now.getTime() + 60_000),
      now,
    });
    assert.ok(
      Buffer.byteLength(JSON.stringify(message), "utf8") <= 4096,
      `${platform} message fits`,
    );
    const data = message.data as Record<string, string>;
    assert.equal(data.title, undefined, "the app reads the notification block");
    assert.equal(data.body, undefined);
    assert.equal(data.androidChannelId, undefined);
    assert.equal(data.kind, "notification");
    assert.equal(data.deepLink, "/orders");
  }

  const { message: chat } = buildFcmMessage({
    payload: {
      ...notificationPayload,
      kind: "chat_message",
      androidChannelId: "chat_messages",
      importance: "HIGH",
      androidDataOnly: true,
      threadId: "chat:r1",
      title: hindi.slice(0, 200),
      body: hindi.slice(0, 1000),
      data: {
        roomId: "r1",
        roomTitle: hindi.slice(0, 200),
        senderName: hindi.slice(0, 200),
        text: hindi.slice(0, 500),
        seq: "7",
      },
    },
    fid,
    platform: "android",
    targetField: "fid",
    expiresAt: new Date(now.getTime() + 60_000),
    now,
  });
  assert.ok(Buffer.byteLength(JSON.stringify(chat), "utf8") <= 4096);
  const data = chat.data as Record<string, string>;
  assert.ok(
    data.title && data.body && data.text,
    "the app draws chat from data",
  );
  assert.equal(data.androidChannelId, "chat_messages");
  assert.equal(data.seq, "7");
  for (const value of Object.values(data)) {
    assert.equal(hasLoneSurrogate(value), false);
  }
});
