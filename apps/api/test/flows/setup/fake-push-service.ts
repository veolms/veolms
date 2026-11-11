/**
 * A stand-in for the browsers' push services (FCM's web push endpoint,
 * Mozilla's autopush), for the web push flow test. It records every push
 * the API posts and answers 201, or the status a test sets for one
 * browser. `decrypt` opens a push as the browser would, so a test reads
 * exactly what the service worker would get.
 *
 * Import it before anything else: it sets the web push environment (keys,
 * the allowed host) before the API's config is first read.
 */
import crypto from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";

import { generateVapidKeys } from "../../../src/modules/notifications/push/web-push.client.ts";

export interface ReceivedPush {
  /** The browser it was sent to (the endpoint's last path part). */
  browser: string;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}

export interface FakeBrowser {
  name: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  ecdh: crypto.ECDH;
  authSecret: Buffer;
}

const received: ReceivedPush[] = [];
const statusFor = new Map<string, number>();

const server = http.createServer((request, response) => {
  const chunks: Buffer[] = [];
  request.on("data", (chunk: Buffer) => chunks.push(chunk));
  request.on("end", () => {
    const browser = (request.url ?? "").split("/").at(-1) ?? "";
    received.push({
      browser,
      headers: request.headers,
      body: Buffer.concat(chunks),
    });
    response.statusCode = statusFor.get(browser) ?? 201;
    response.end();
  });
});
const vapid = generateVapidKeys();
// Set before the first await: modules imported after this one may run
// while it waits for the port.
delete process.env.PUSH_APPS;
Object.assign(process.env, {
  PUSH_ENABLED: "true",
  WEB_PUSH_ENABLED: "true",
  WEB_PUSH_VAPID_PUBLIC_KEY: vapid.publicKey,
  WEB_PUSH_VAPID_PRIVATE_KEY: vapid.privateKey,
  WEB_PUSH_SUBJECT: "mailto:flow@veolms.test",
  WEB_PUSH_ALLOWED_HOSTS: "fcm.googleapis.com,http://127.0.0.1",
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

function hmac(key: Buffer, data: Buffer): Buffer {
  return crypto.createHmac("sha256", key).update(data).digest();
}

export const fakePush = {
  origin,
  publicKey: vapid.publicKey,
  received,
  /** Answer `status` to pushes for this browser (undefined: 201 again). */
  answer(browser: FakeBrowser, status: number | undefined) {
    if (status === undefined) statusFor.delete(browser.name);
    else statusFor.set(browser.name, status);
  },
  /** A browser with its own keys, subscribed at this service. */
  browser(name: string): FakeBrowser {
    const ecdh = crypto.createECDH("prime256v1");
    ecdh.generateKeys();
    const authSecret = crypto.randomBytes(16);
    return {
      name,
      endpoint: `${origin}/push/${name}`,
      keys: {
        p256dh: ecdh.getPublicKey().toString("base64url"),
        auth: authSecret.toString("base64url"),
      },
      ecdh,
      authSecret,
    };
  },
  /** The pushes this browser received, opened as the browser would. */
  pushesFor(browser: FakeBrowser): Record<string, unknown>[] {
    return received
      .filter((push) => push.browser === browser.name)
      .map((push) => JSON.parse(fakePush.decrypt(push, browser)));
  },
  decrypt(push: ReceivedPush, browser: FakeBrowser): string {
    const body = push.body;
    const salt = body.subarray(0, 16);
    const idLength = body.readUInt8(20);
    const serverPublic = body.subarray(21, 21 + idLength);
    const ciphertext = body.subarray(21 + idLength);
    const ikm = hmac(
      hmac(browser.authSecret, browser.ecdh.computeSecret(serverPublic)),
      Buffer.concat([
        Buffer.from("WebPush: info\0"),
        browser.ecdh.getPublicKey(),
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
    return padded.subarray(0, -1).toString("utf8");
  },
  async close() {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  },
};
