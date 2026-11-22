import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test } from "node:test";

import { chatPushDeliveries } from "./push-payloads.ts";
import { buildWebPushMessage, type PushPayload } from "./push-message.ts";
import {
  classifyWebPushStatus,
  createVapidJwt,
  createWebPushClient,
  encryptWebPush,
  generateVapidKeys,
  isAllowedPushEndpoint,
  readVapidKeys,
  WEB_PUSH_MAX_PAYLOAD_BYTES,
} from "./web-push.client.ts";
import { isWebPushFid, webPushFid } from "./web-push.service.ts";

const b64 = (value: string) => Buffer.from(value, "base64url");

/** The browser's side of RFC 8291: what Chrome does with our body. */
function decryptAsBrowser(
  body: Buffer,
  browser: crypto.ECDH,
  authSecret: Buffer,
): string {
  const salt = body.subarray(0, 16);
  const recordSize = body.readUInt32BE(16);
  const idLength = body.readUInt8(20);
  const serverPublic = body.subarray(21, 21 + idLength);
  const ciphertext = body.subarray(21 + idLength);
  assert.equal(recordSize, 4096);
  const hmac = (key: Buffer, data: Buffer) =>
    crypto.createHmac("sha256", key).update(data).digest();
  const shared = browser.computeSecret(serverPublic);
  const ikm = hmac(
    hmac(authSecret, shared),
    Buffer.concat([
      Buffer.from("WebPush: info\0"),
      browser.getPublicKey(),
      serverPublic,
      Buffer.from([1]),
    ]),
  );
  const prk = hmac(salt, ikm);
  const key = hmac(
    prk,
    Buffer.from("Content-Encoding: aes128gcm\0\x01", "binary"),
  ).subarray(0, 16);
  const nonce = hmac(
    prk,
    Buffer.from("Content-Encoding: nonce\0\x01", "binary"),
  ).subarray(0, 12);
  const decipher = crypto.createDecipheriv("aes-128-gcm", key, nonce);
  decipher.setAuthTag(ciphertext.subarray(-16));
  const padded = Buffer.concat([
    decipher.update(ciphertext.subarray(0, -16)),
    decipher.final(),
  ]);
  // The last record ends with the 0x02 delimiter.
  assert.equal(padded.at(-1), 2);
  return padded.subarray(0, -1).toString("utf8");
}

function newBrowser() {
  const keys = crypto.createECDH("prime256v1");
  keys.generateKeys();
  const auth = crypto.randomBytes(16);
  return {
    keys,
    auth,
    subscription: {
      p256dh: keys.getPublicKey().toString("base64url"),
      auth: auth.toString("base64url"),
    },
  };
}

await test("encryption matches RFC 8291's worked example", () => {
  // RFC 8291, Appendix A.
  const serverKeys = crypto.createECDH("prime256v1");
  serverKeys.setPrivateKey(b64("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw"));
  const body = encryptWebPush(
    {
      p256dh:
        "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
      auth: "BTBZMqHH6r4Tts7J_aSIgg",
    },
    Buffer.from("When I grow up, I want to be a watermelon"),
    { salt: b64("DGv6ra1nlYgDCS1FRnbzlw"), serverKeys },
  );
  assert.equal(
    body.toString("base64url"),
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
  );
});

await test("a browser decrypts what we send it", () => {
  const browser = newBrowser();
  const text = JSON.stringify({ title: "Asha", body: "नमस्ते 👋" });
  const body = encryptWebPush(browser.subscription, Buffer.from(text));
  assert.equal(decryptAsBrowser(body, browser.keys, browser.auth), text);
});

await test("VAPID: a key pair is checked and signs a JWT the push service can verify", () => {
  const pair = generateVapidKeys();
  const { vapid, problem } = readVapidKeys({
    ...pair,
    subject: "mailto:support@example.test",
  });
  assert.equal(problem, null);
  const jwt = createVapidJwt(vapid!, "https://fcm.googleapis.com", 1_000_000);
  const [header, claims, signature] = jwt.split(".");
  assert.deepEqual(JSON.parse(b64(header!).toString()), {
    typ: "JWT",
    alg: "ES256",
  });
  assert.deepEqual(JSON.parse(b64(claims!).toString()), {
    aud: "https://fcm.googleapis.com",
    exp: 1_000_000 + 12 * 3600,
    sub: "mailto:support@example.test",
  });
  const publicPoint = b64(pair.publicKey);
  const verifier = crypto.createPublicKey({
    key: {
      kty: "EC",
      crv: "P-256",
      x: publicPoint.subarray(1, 33).toString("base64url"),
      y: publicPoint.subarray(33).toString("base64url"),
    },
    format: "jwk",
  });
  assert.ok(
    crypto.verify(
      "sha256",
      Buffer.from(`${header}.${claims}`),
      { key: verifier, dsaEncoding: "ieee-p1363" },
      b64(signature!),
    ),
  );

  // Halves of two different pairs: refused, with a reason, not used.
  const other = generateVapidKeys();
  const mixed = readVapidKeys({
    publicKey: pair.publicKey,
    privateKey: other.privateKey,
    subject: "mailto:a@example.test",
  });
  assert.equal(mixed.vapid, null);
  assert.match(mixed.problem ?? "", /does not belong/u);
  assert.deepEqual(
    readVapidKeys({
      publicKey: undefined,
      privateKey: undefined,
      subject: "x",
    }),
    { vapid: null, problem: null },
  );
  assert.match(
    readVapidKeys({ ...pair, subject: "support@example.test" }).problem ?? "",
    /SUBJECT/u,
  );
});

await test("only the browsers' push services are posted to", () => {
  const allowed = [
    "fcm.googleapis.com",
    ".push.services.mozilla.com",
    ".push.apple.com",
    "http://127.0.0.1:4999",
    "http://localhost",
  ];
  const yes = [
    "https://fcm.googleapis.com/fcm/send/abc:def",
    "https://updates.push.services.mozilla.com/wpush/v2/gAAA",
    "https://web.push.apple.com/QFB2",
    "http://127.0.0.1:4999/push/1",
    "http://localhost:4123/push/1",
  ];
  const no = [
    "http://fcm.googleapis.com/fcm/send/abc", // not https
    "https://fcm.googleapis.com.evil.test/x",
    "https://push.services.mozilla.com/x", // the suffix alone is not a subdomain
    "https://evil.test/?h=fcm.googleapis.com",
    "https://user:pw@fcm.googleapis.com/x",
    "http://127.0.0.1:5000/push/1",
    "https://localhost:4999/push/1",
    "not a url",
  ];
  for (const endpoint of yes) {
    assert.ok(isAllowedPushEndpoint(endpoint, allowed), endpoint);
  }
  for (const endpoint of no) {
    assert.ok(!isAllowedPushEndpoint(endpoint, allowed), endpoint);
  }
});

await test("push service answers map to what happens to the subscription", () => {
  assert.equal(classifyWebPushStatus(410, "", undefined).kind, "dead");
  assert.equal(classifyWebPushStatus(404, "", undefined).kind, "dead");
  assert.equal(classifyWebPushStatus(403, "", undefined).kind, "dead");
  assert.equal(classifyWebPushStatus(401, "", undefined).kind, "auth");
  assert.equal(classifyWebPushStatus(413, "", undefined).kind, "bad_message");
  assert.equal(classifyWebPushStatus(400, "", undefined).kind, "bad_message");
  const limited = classifyWebPushStatus(429, "", 5_000);
  assert.equal(limited.kind, "retry");
  assert.equal(limited.retryAfterMs, 60_000);
  const busy = classifyWebPushStatus(503, "busy", 2_000);
  assert.equal(busy.kind, "retry");
  assert.equal(busy.retryAfterMs, 2_000);
});

await test("the client posts an encrypted, signed push with TTL, urgency and topic", async () => {
  const pair = generateVapidKeys();
  const { vapid } = readVapidKeys({ ...pair, subject: "mailto:a@b.test" });
  const browser = newBrowser();
  const requests: { url: string; init: RequestInit }[] = [];
  const client = createWebPushClient({
    vapid: vapid!,
    fetchImpl: async (url, init) => {
      requests.push({ url: String(url), init: init! });
      return new Response(null, {
        status: requests.length === 1 ? 201 : 410,
        headers: { location: "https://fcm.googleapis.com/m/1" },
      });
    },
  });
  const subscription = {
    endpoint: "https://fcm.googleapis.com/fcm/send/abc",
    ...browser.subscription,
  };
  const sent = await client.send(subscription, '{"hello":1}', {
    ttlSeconds: 3600,
    urgency: "high",
    topic: "room1",
  });
  assert.deepEqual(sent, {
    ok: true,
    messageId: "https://fcm.googleapis.com/m/1",
  });
  const headers = requests[0]!.init.headers as Record<string, string>;
  assert.equal(headers["content-encoding"], "aes128gcm");
  assert.equal(headers.ttl, "3600");
  assert.equal(headers.urgency, "high");
  assert.equal(headers.topic, "room1");
  assert.match(headers.authorization!, /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/u);
  assert.equal(
    decryptAsBrowser(
      Buffer.from(requests[0]!.init.body as Uint8Array),
      browser.keys,
      browser.auth,
    ),
    '{"hello":1}',
  );

  const gone = await client.send(subscription, "{}", {
    ttlSeconds: 60,
    urgency: "normal",
  });
  assert.equal(gone.ok, false);
  assert.equal(!gone.ok && gone.kind, "dead");

  const tooBig = await client.send(
    subscription,
    "x".repeat(WEB_PUSH_MAX_PAYLOAD_BYTES + 1),
    { ttlSeconds: 60, urgency: "normal" },
  );
  assert.equal(!tooBig.ok && tooBig.kind, "bad_message");
  assert.equal(requests.length, 2, "an oversized push is never posted");
});

await test("a chat push for a browser: tagged per chat, topic per chat, under the size limit", () => {
  const roomId = "3f0c2a8e-5b8d-4c1e-9f5a-0d2b7c6e1a90";
  const [delivery] = chatPushDeliveries(
    {
      roomId,
      roomKind: "course",
      roomTitle: "React Course",
      messageId: "6a1b0c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d",
      seq: 41,
      senderId: "s1",
      senderName: "Asha",
      text: "🙂".repeat(2_000),
      sentAt: new Date("2026-11-11T10:00:00Z"),
      isRequest: false,
      recipients: [{ userId: "u1", isMention: true, unreadCount: 3 }],
    },
    new Set(["u1"]),
    new Date("2026-11-11T10:00:00Z"),
  );
  const message = buildWebPushMessage({
    payload: delivery!.payload as unknown as PushPayload,
    expiresAt: new Date("2026-11-11T11:00:00Z"),
    now: new Date("2026-11-11T10:00:00Z"),
  });
  const parsed = JSON.parse(message.json) as Record<string, unknown>;
  assert.equal(parsed.title, "React Course");
  assert.match(String(parsed.body), /^Asha: 🙂/u);
  assert.equal(parsed.tag, `chat:${roomId}`);
  assert.equal(parsed.url, `/chat/${roomId}?seq=41`);
  assert.equal(parsed.seq, 41);
  assert.equal(parsed.unread, 3);
  assert.equal(parsed.isMention, true);
  assert.equal(message.topic, roomId.replace(/-/gu, ""));
  assert.equal(message.urgency, "high");
  assert.equal(message.ttlSeconds, 3600);
  assert.ok(Buffer.byteLength(message.json) <= 3_000);
});

await test("a browser's row id is a hash of its endpoint, kept apart from phone ids", () => {
  const fid = webPushFid("https://fcm.googleapis.com/fcm/send/abc");
  assert.match(fid, /^web:[\w-]{43}$/u);
  assert.equal(fid, webPushFid("https://fcm.googleapis.com/fcm/send/abc"));
  assert.notEqual(fid, webPushFid("https://fcm.googleapis.com/fcm/send/abd"));
  assert.ok(isWebPushFid(fid));
  assert.ok(!isWebPushFid("cXk7Hb3sR2mZ8a1bC4dE5f"));
});
