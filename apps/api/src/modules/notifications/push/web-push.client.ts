import crypto from "node:crypto";

import type { FcmOutcome } from "./fcm.client.ts";

/**
 * Web Push to browsers: the message is encrypted for the browser
 * (RFC 8291, aes128gcm) and posted to its push service with a VAPID
 * signature (RFC 8292). No SDK: node:crypto has everything it takes.
 *
 * The push service's answer maps onto the same outcomes as Firebase's, so
 * the sender treats browsers and phones alike: 404/410 (and 403, a
 * subscription made with another key) mean the subscription is gone.
 */

export type WebPushOutcome = FcmOutcome;

export interface WebPushSubscription {
  endpoint: string;
  /** The browser's P-256 public key, base64url (65 bytes uncompressed). */
  p256dh: string;
  /** The browser's auth secret, base64url (16 bytes). */
  auth: string;
}

export interface WebPushVapid {
  publicKey: string;
  privateKey: crypto.KeyObject;
  subject: string;
}

export interface WebPushClient {
  send(
    subscription: WebPushSubscription,
    payload: string,
    options: {
      ttlSeconds: number;
      urgency: "very-low" | "low" | "normal" | "high";
      /** Replaces an undelivered push with the same topic (≤ 32 chars). */
      topic?: string | undefined;
    },
  ): Promise<WebPushOutcome>;
}

/**
 * The most a push may carry before encryption. Push services take 4,096
 * bytes of encrypted body (86 bytes of header, 17 of padding and tag).
 */
export const WEB_PUSH_MAX_PAYLOAD_BYTES = 3_993;
const RECORD_SIZE = 4_096;
const REQUEST_TIMEOUT_MS = 10_000;
/** A VAPID signature is reused this long (push services allow 24 h). */
const JWT_LIFETIME_S = 12 * 60 * 60;
const JWT_REUSE_MS = 60 * 60 * 1000;

function fromBase64Url(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

/**
 * Reads the VAPID pair from config; null and a reason when it is missing
 * or the two halves do not belong together (pushes signed with the wrong
 * key would all be refused, and every subscription dropped).
 */
export function readVapidKeys(input: {
  publicKey: string | undefined;
  privateKey: string | undefined;
  subject: string;
}): { vapid: WebPushVapid | null; problem: string | null } {
  if (!input.publicKey || !input.privateKey) {
    return { vapid: null, problem: null };
  }
  try {
    const publicPoint = fromBase64Url(input.publicKey);
    const privateScalar = fromBase64Url(input.privateKey);
    if (publicPoint.length !== 65 || publicPoint[0] !== 4) {
      throw new Error("the public key is not a 65-byte P-256 point");
    }
    if (privateScalar.length !== 32) {
      throw new Error("the private key is not 32 bytes");
    }
    const ecdh = crypto.createECDH("prime256v1");
    ecdh.setPrivateKey(privateScalar);
    if (!ecdh.getPublicKey().equals(publicPoint)) {
      throw new Error("the public key does not belong to the private key");
    }
    if (!/^(mailto:|https:\/\/|http:\/\/localhost)/u.test(input.subject)) {
      throw new Error("WEB_PUSH_SUBJECT must be a mailto: or https: URL");
    }
    const privateKey = crypto.createPrivateKey({
      key: {
        kty: "EC",
        crv: "P-256",
        d: input.privateKey,
        x: publicPoint.subarray(1, 33).toString("base64url"),
        y: publicPoint.subarray(33, 65).toString("base64url"),
      },
      format: "jwk",
    });
    return {
      vapid: { publicKey: input.publicKey, privateKey, subject: input.subject },
      problem: null,
    };
  } catch (error) {
    return {
      vapid: null,
      problem: `Web push is off: WEB_PUSH_VAPID keys are unusable (${error instanceof Error ? error.message : String(error)}).`,
    };
  }
}

/** A new VAPID pair (the web-push:keys command). */
export function generateVapidKeys(): { publicKey: string; privateKey: string } {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    publicKey: ecdh.getPublicKey().toString("base64url"),
    privateKey: ecdh.getPrivateKey().toString("base64url"),
  };
}

/** The signed VAPID JWT for one push service (`aud` = its origin). */
export function createVapidJwt(
  vapid: WebPushVapid,
  audience: string,
  nowSeconds: number,
): string {
  const header = Buffer.from(
    JSON.stringify({ typ: "JWT", alg: "ES256" }),
  ).toString("base64url");
  const claims = Buffer.from(
    JSON.stringify({
      aud: audience,
      exp: nowSeconds + JWT_LIFETIME_S,
      sub: vapid.subject,
    }),
  ).toString("base64url");
  const signature = crypto.sign("sha256", Buffer.from(`${header}.${claims}`), {
    key: vapid.privateKey,
    dsaEncoding: "ieee-p1363",
  });
  return `${header}.${claims}.${signature.toString("base64url")}`;
}

function hmac(key: Buffer, data: Buffer): Buffer {
  return crypto.createHmac("sha256", key).update(data).digest();
}

/**
 * Encrypts `plaintext` for one browser (RFC 8291 §3.4, one aes128gcm
 * record). `salt` and `serverKeys` are fixed only in tests.
 */
export function encryptWebPush(
  subscription: Pick<WebPushSubscription, "p256dh" | "auth">,
  plaintext: Buffer,
  fixed?: { salt: Buffer; serverKeys: crypto.ECDH },
): Buffer {
  const browserKey = fromBase64Url(subscription.p256dh);
  const authSecret = fromBase64Url(subscription.auth);
  if (browserKey.length !== 65 || authSecret.length < 16) {
    throw new Error("Invalid subscription keys");
  }
  const serverKeys = fixed?.serverKeys ?? crypto.createECDH("prime256v1");
  if (!fixed) serverKeys.generateKeys();
  const serverPublic = serverKeys.getPublicKey();
  const salt = fixed?.salt ?? crypto.randomBytes(16);

  const sharedSecret = serverKeys.computeSecret(browserKey);
  const keyInfo = Buffer.concat([
    Buffer.from("WebPush: info\0"),
    browserKey,
    serverPublic,
  ]);
  const ikm = hmac(
    hmac(authSecret, sharedSecret),
    Buffer.concat([keyInfo, Buffer.from([1])]),
  );
  const prk = hmac(salt, ikm);
  const contentKey = hmac(
    prk,
    Buffer.from("Content-Encoding: aes128gcm\0\x01", "binary"),
  ).subarray(0, 16);
  const nonce = hmac(
    prk,
    Buffer.from("Content-Encoding: nonce\0\x01", "binary"),
  ).subarray(0, 12);

  const cipher = crypto.createCipheriv("aes-128-gcm", contentKey, nonce);
  const body = Buffer.concat([
    cipher.update(Buffer.concat([plaintext, Buffer.from([2])])),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  const header = Buffer.alloc(16 + 4 + 1);
  salt.copy(header, 0);
  header.writeUInt32BE(RECORD_SIZE, 16);
  header.writeUInt8(serverPublic.length, 20);
  return Buffer.concat([header, serverPublic, body]);
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : undefined;
}

/** What a push service's answer means for the subscription. */
export function classifyWebPushStatus(
  httpStatus: number,
  text: string,
  retryAfterMs: number | undefined,
): Exclude<WebPushOutcome, { ok: true }> {
  const error = `HTTP ${httpStatus}${text ? `: ${text}` : ""}`.slice(0, 500);
  // Unsubscribed or expired; 403: made with another VAPID key (ours
  // changed), so it can never receive from us again.
  if (httpStatus === 404 || httpStatus === 410 || httpStatus === 403) {
    return { ok: false, kind: "dead", error };
  }
  // Our signature refused (a clock far off, a broken key): pause.
  if (httpStatus === 401) return { ok: false, kind: "auth", error };
  if (httpStatus === 400 || httpStatus === 413) {
    return { ok: false, kind: "bad_message", error };
  }
  if (httpStatus === 429) {
    return {
      ok: false,
      kind: "retry",
      error,
      retryAfterMs: Math.max(retryAfterMs ?? 0, 60_000),
    };
  }
  return { ok: false, kind: "retry", error, retryAfterMs };
}

export function createWebPushClient({
  vapid,
  fetchImpl = fetch,
}: {
  vapid: WebPushVapid;
  fetchImpl?: typeof fetch;
}): WebPushClient {
  /** Push service origin → its signed JWT and when it was made. */
  const jwts = new Map<string, { jwt: string; madeAt: number }>();

  function jwtFor(audience: string): string {
    const cached = jwts.get(audience);
    if (cached && Date.now() - cached.madeAt < JWT_REUSE_MS) return cached.jwt;
    const jwt = createVapidJwt(vapid, audience, Math.floor(Date.now() / 1000));
    jwts.set(audience, { jwt, madeAt: Date.now() });
    return jwt;
  }

  async function send(
    subscription: WebPushSubscription,
    payload: string,
    options: {
      ttlSeconds: number;
      urgency: "very-low" | "low" | "normal" | "high";
      topic?: string | undefined;
    },
  ): Promise<WebPushOutcome> {
    const plaintext = Buffer.from(payload, "utf8");
    if (plaintext.length > WEB_PUSH_MAX_PAYLOAD_BYTES) {
      return {
        ok: false,
        kind: "bad_message",
        error: `Payload of ${plaintext.length} bytes is over ${WEB_PUSH_MAX_PAYLOAD_BYTES}.`,
      };
    }
    let body: Buffer;
    let audience: string;
    try {
      audience = new URL(subscription.endpoint).origin;
      body = encryptWebPush(subscription, plaintext);
    } catch (error) {
      // The subscription itself is broken: it can never receive.
      return {
        ok: false,
        kind: "dead",
        error: `Unusable subscription: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    let response: Response;
    try {
      response = await fetchImpl(subscription.endpoint, {
        method: "POST",
        headers: {
          authorization: `vapid t=${jwtFor(audience)}, k=${vapid.publicKey}`,
          "content-encoding": "aes128gcm",
          "content-type": "application/octet-stream",
          ttl: String(Math.max(0, Math.floor(options.ttlSeconds))),
          urgency: options.urgency,
          ...(options.topic ? { topic: options.topic } : {}),
        },
        body: new Uint8Array(body),
        redirect: "manual",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      return {
        ok: false,
        kind: "retry",
        error: `Push service unreachable: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    if (response.status >= 200 && response.status < 300) {
      await response.body?.cancel().catch(() => {});
      return { ok: true, messageId: response.headers.get("location") ?? "" };
    }
    if (response.status === 401) jwts.delete(audience);
    const text = (await response.text().catch(() => "")).slice(0, 300);
    return classifyWebPushStatus(
      response.status,
      text.replace(/\s+/gu, " ").trim(),
      parseRetryAfter(response.headers.get("retry-after")),
    );
  }

  return { send };
}

/**
 * Whether a browser's endpoint may be used: https (http only for a host
 * listed with its scheme, e.g. a local stand-in in tests, any port unless
 * one is given) on one of
 * WEB_PUSH_ALLOWED_HOSTS (`host` exactly, `.suffix` for any subdomain).
 */
export function isAllowedPushEndpoint(
  endpoint: string,
  allowedHosts: readonly string[],
): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.username || url.password) return false;
  return allowedHosts.some((rule) => {
    const entry = rule.trim().toLowerCase();
    if (!entry) return false;
    if (entry.startsWith("http://") || entry.startsWith("https://")) {
      // With a port, that port only; without, any port on that host.
      const allowed = new URL(entry);
      return (
        url.protocol === allowed.protocol &&
        (allowed.port
          ? url.host === allowed.host
          : url.hostname === allowed.hostname)
      );
    }
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    return entry.startsWith(".")
      ? host.endsWith(entry) && host.length > entry.length
      : host === entry;
  });
}

export function parseAllowedPushHosts(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}
