import https from "node:https";
import net from "node:net";
import tls from "node:tls";

import {
  cert,
  deleteApp,
  initializeApp,
  type App,
  type Credential,
} from "firebase-admin/app";
import {
  getMessaging,
  type AndroidConfig,
  type ApnsConfig,
  type Message,
  type Messaging,
} from "firebase-admin/messaging";

import type { ServiceAccount } from "./push-apps.ts";

/**
 * Firebase Cloud Messaging through the official Admin SDK
 * (`firebase-admin`): one Firebase app per service account, signed in and
 * kept signed in by the SDK. One send per install.
 *
 * The message is built as the HTTP v1 JSON (`buildFcmMessage`) and handed
 * to the SDK in its own shape, which it turns back into the same JSON.
 * Errors are judged from Firebase's own answer, which the SDK keeps on the
 * error (`httpResponse`), so they mean exactly what they always did.
 */

export type FcmOutcome =
  | { ok: true; messageId: string }
  | {
      ok: false;
      /**
       * dead: the install will never receive again (delete it).
       * retry: try again later. auth: our key is wrong (pause this app).
       * bad_message: the message itself is invalid (do not retry).
       */
      kind: "dead" | "retry" | "auth" | "bad_message";
      error: string;
      /** From Retry-After, when given. */
      retryAfterMs?: number;
    };

export interface FcmClient {
  send(
    account: ServiceAccount,
    body: { message: Record<string, unknown> },
  ): Promise<FcmOutcome>;
}

const DEFAULT_ENDPOINT = "https://fcm.googleapis.com";

function parseRetryAfter(
  value: string | string[] | number | undefined | null,
): number | undefined {
  const text = Array.isArray(value) ? value[0] : value;
  if (text === undefined || text === null || text === "") return undefined;
  const seconds = Number(text);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(String(text));
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : undefined;
}

interface FcmErrorBody {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: { "@type"?: string; errorCode?: string }[];
  };
}

/** Maps an HTTP v1 error to what the sender should do with the install. */
export function classifyFcmError(
  httpStatus: number,
  body: FcmErrorBody | null,
  retryAfterMs: number | undefined,
): Exclude<FcmOutcome, { ok: true }> {
  const status = body?.error?.status ?? "";
  const text = body?.error?.message ?? `HTTP ${httpStatus}`;
  const errorCode =
    body?.error?.details?.find((detail) =>
      detail["@type"]?.endsWith("FcmError"),
    )?.errorCode ?? status;
  const error = `${errorCode || httpStatus}: ${text}`.slice(0, 500);

  switch (errorCode) {
    case "UNREGISTERED":
    case "SENDER_ID_MISMATCH":
      return { ok: false, kind: "dead", error };
    case "INVALID_ARGUMENT":
      // Also returned for a broken message; only a complaint about the
      // install itself means the install is dead.
      return /registration|token|fid|installation/i.test(text)
        ? { ok: false, kind: "dead", error }
        : { ok: false, kind: "bad_message", error };
    case "QUOTA_EXCEEDED":
    case "RESOURCE_EXHAUSTED":
      return {
        ok: false,
        kind: "retry",
        error,
        // Firebase asks for at least a minute after a rate limit.
        retryAfterMs: Math.max(retryAfterMs ?? 0, 60_000),
      };
    case "THIRD_PARTY_AUTH_ERROR":
    case "PERMISSION_DENIED":
      return { ok: false, kind: "auth", error };
    case "UNAUTHENTICATED":
      // A stale access token: the client signs in afresh on the next try.
      // A key that is really wrong fails at sign-in, which pauses the app.
      return { ok: false, kind: "retry", error, retryAfterMs: 0 };
    case "UNAVAILABLE":
    case "INTERNAL":
      return { ok: false, kind: "retry", error, retryAfterMs };
  }
  if (httpStatus === 401) {
    return { ok: false, kind: "retry", error, retryAfterMs: 0 };
  }
  if (httpStatus === 403) {
    return { ok: false, kind: "auth", error };
  }
  if (httpStatus === 404) return { ok: false, kind: "dead", error };
  if (httpStatus === 400) return { ok: false, kind: "bad_message", error };
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

/**
 * For an error the SDK raised without an answer from Firebase (it checked
 * the message itself, or never got through): what its `messaging/*` code
 * means. Answers from Firebase go through `classifyFcmError` instead.
 */
const OUTCOME_FOR_SDK_CODE: Record<
  string,
  Exclude<FcmOutcome, { ok: true }>["kind"]
> = {
  "messaging/registration-token-not-registered": "dead",
  "messaging/installation-id-not-registered": "dead",
  "messaging/invalid-registration-token": "dead",
  "messaging/mismatched-credential": "dead",
  "messaging/invalid-argument": "bad_message",
  "messaging/invalid-recipient": "bad_message",
  "messaging/invalid-payload": "bad_message",
  "messaging/invalid-data-payload-key": "bad_message",
  "messaging/payload-size-limit-exceeded": "bad_message",
  "messaging/invalid-options": "bad_message",
  "messaging/invalid-package-name": "bad_message",
  "messaging/third-party-auth-error": "auth",
  "messaging/authentication-error": "auth",
};

const RATE_LIMIT_CODES = new Set([
  "messaging/message-rate-exceeded",
  "messaging/device-message-rate-exceeded",
]);

interface SdkError {
  code?: unknown;
  message?: unknown;
  cause?: unknown;
  httpResponse?: {
    status?: unknown;
    headers?: Record<string, string | string[] | number | undefined>;
    data?: unknown;
  };
}

function text(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Maps anything `messaging.send` throws to what happens to the install. */
export function classifyAdminError(
  error: unknown,
): Exclude<FcmOutcome, { ok: true }> {
  const sdk = (error ?? {}) as SdkError;
  const code = typeof sdk.code === "string" ? sdk.code : "";

  const response = sdk.httpResponse;
  if (response && typeof response.status === "number") {
    const body =
      response.data && typeof response.data === "object"
        ? (response.data as FcmErrorBody)
        : null;
    return classifyFcmError(
      response.status,
      body,
      parseRetryAfter(response.headers?.["retry-after"]),
    );
  }

  if (code === "app/invalid-credential") {
    // The SDK failed to sign in. Google answered (key refused, revoked,
    // clock off): our key is wrong. No answer: try again later.
    const cause = sdk.cause as { response?: unknown } | undefined;
    return cause?.response
      ? {
          ok: false,
          kind: "auth",
          error: `Firebase sign-in failed: ${text(error)}`.slice(0, 500),
        }
      : {
          ok: false,
          kind: "retry",
          error: `Firebase sign-in unreachable: ${text(error)}`.slice(0, 500),
        };
  }
  if (RATE_LIMIT_CODES.has(code)) {
    return {
      ok: false,
      kind: "retry",
      error: `${code}: ${text(error)}`.slice(0, 500),
      retryAfterMs: 60_000,
    };
  }
  const kind = OUTCOME_FOR_SDK_CODE[code];
  if (kind) {
    return { ok: false, kind, error: `${code}: ${text(error)}`.slice(0, 500) };
  }
  // app/network-error, app/network-timeout, messaging/server-unavailable,
  // messaging/internal-error, messaging/unknown-error and the rest.
  return {
    ok: false,
    kind: "retry",
    error: `Firebase unreachable: ${text(error)}`.slice(0, 500),
  };
}

/** The HTTP v1 message `buildFcmMessage` writes. */
interface FcmV1Message {
  fid?: string;
  token?: string;
  data?: Record<string, string>;
  android?: {
    priority?: "HIGH" | "NORMAL";
    ttl?: string;
    collapse_key?: string;
    notification?: {
      title?: string;
      body?: string;
      channel_id?: string;
      notification_priority?: string;
      default_sound?: boolean;
      default_vibrate_timings?: boolean;
      tag?: string;
    };
  };
  apns?: {
    headers?: Record<string, string>;
    payload?: {
      aps?: {
        alert?: { title?: string; body?: string };
        sound?: string;
        "thread-id"?: string;
        "mutable-content"?: number;
      };
    };
  };
}

type AndroidNotificationPriority = NonNullable<
  NonNullable<AndroidConfig["notification"]>["priority"]
>;

/**
 * The same message in the Admin SDK's shape. The SDK writes it back as the
 * identical HTTP v1 JSON (camelCase → snake_case, ttl in ms → "Ns",
 * "PRIORITY_X", mutableContent → 1).
 */
export function toAdminMessage(raw: Record<string, unknown>): Message {
  const v1 = raw as FcmV1Message;
  const base: {
    data?: Record<string, string>;
    android?: AndroidConfig;
    apns?: ApnsConfig;
  } = {};
  if (v1.data) base.data = v1.data;

  if (v1.android) {
    const android: AndroidConfig = {};
    if (v1.android.priority) {
      android.priority = v1.android.priority === "HIGH" ? "high" : "normal";
    }
    if (v1.android.ttl !== undefined) {
      android.ttl = Number(v1.android.ttl.replace(/s$/u, "")) * 1000;
    }
    if (v1.android.collapse_key) android.collapseKey = v1.android.collapse_key;
    const notification = v1.android.notification;
    if (notification) {
      android.notification = {
        ...(notification.title !== undefined
          ? { title: notification.title }
          : {}),
        ...(notification.body !== undefined ? { body: notification.body } : {}),
        ...(notification.channel_id !== undefined
          ? { channelId: notification.channel_id }
          : {}),
        ...(notification.notification_priority
          ? {
              priority: notification.notification_priority
                .replace(/^PRIORITY_/u, "")
                .toLowerCase() as AndroidNotificationPriority,
            }
          : {}),
        ...(notification.default_sound !== undefined
          ? { defaultSound: notification.default_sound }
          : {}),
        ...(notification.default_vibrate_timings !== undefined
          ? { defaultVibrateTimings: notification.default_vibrate_timings }
          : {}),
        ...(notification.tag !== undefined ? { tag: notification.tag } : {}),
      };
    }
    base.android = android;
  }

  if (v1.apns) {
    const aps = v1.apns.payload?.aps;
    base.apns = {
      ...(v1.apns.headers ? { headers: v1.apns.headers } : {}),
      ...(aps
        ? {
            payload: {
              aps: {
                ...(aps.alert ? { alert: aps.alert } : {}),
                ...(aps.sound !== undefined ? { sound: aps.sound } : {}),
                ...(aps["thread-id"] !== undefined
                  ? { threadId: aps["thread-id"] }
                  : {}),
                ...(aps["mutable-content"] === 1
                  ? { mutableContent: true }
                  : {}),
              },
            },
          }
        : {}),
    };
  }

  if (typeof v1.fid === "string") return { ...base, fid: v1.fid };
  return { ...base, token: v1.token ?? "" };
}

/**
 * The SDK always calls https://fcm.googleapis.com. For another
 * PUSH_FCM_ENDPOINT (a stand-in or a proxy), its connections are made to
 * that host instead; the request itself is unchanged.
 */
function agentFor(endpoint: string): https.Agent | undefined {
  const url = new URL(endpoint);
  if (url.origin === DEFAULT_ENDPOINT) return undefined;
  const host = url.hostname;
  const secure = url.protocol === "https:";
  const port = Number(url.port) || (secure ? 443 : 80);
  const agent = new https.Agent({ keepAlive: true });
  (
    agent as unknown as { createConnection: () => net.Socket }
  ).createConnection = () =>
    secure
      ? tls.connect({ host, port, servername: host })
      : net.connect({ host, port });
  return agent;
}

let appCounter = 0;

export function createFcmClient({
  endpoint = DEFAULT_ENDPOINT,
  credentialFor = (account) =>
    cert({
      projectId: account.projectId,
      clientEmail: account.clientEmail,
      privateKey: account.privateKey,
    }),
}: {
  endpoint?: string;
  /** How each service account signs in (tests replace it). */
  credentialFor?: (account: ServiceAccount) => Credential;
} = {}): FcmClient {
  const httpAgent = agentFor(endpoint);
  /** One Firebase app per service account. */
  const apps = new Map<string, { app: App; messaging: Messaging }>();

  function keyOf(account: ServiceAccount): string {
    return `${account.projectId}\u0000${account.clientEmail}`;
  }

  function messagingFor(account: ServiceAccount): Messaging {
    const key = keyOf(account);
    const known = apps.get(key);
    if (known) return known.messaging;
    const app = initializeApp(
      {
        credential: credentialFor(account),
        projectId: account.projectId,
        ...(httpAgent ? { httpAgent } : {}),
      },
      `veolms-push-${++appCounter}`,
    );
    const messaging = getMessaging(app);
    apps.set(key, { app, messaging });
    return messaging;
  }

  /** Signs in afresh next time (the SDK keeps its token until it expires). */
  function forget(account: ServiceAccount) {
    const key = keyOf(account);
    const known = apps.get(key);
    if (!known) return;
    apps.delete(key);
    void deleteApp(known.app).catch(() => {});
  }

  async function send(
    account: ServiceAccount,
    body: { message: Record<string, unknown> },
  ): Promise<FcmOutcome> {
    let messaging: Messaging;
    try {
      messaging = messagingFor(account);
    } catch (error) {
      // cert() refused the key (say, a private key that does not parse).
      // As before the SDK, when signing with such a key threw: retried.
      return {
        ok: false,
        kind: "retry",
        error: `Firebase sign-in unreachable: ${text(error)}`.slice(0, 500),
      };
    }
    try {
      const messageId = await messaging.send(toAdminMessage(body.message));
      return { ok: true, messageId };
    } catch (error) {
      if ((error as SdkError | null)?.httpResponse?.status === 401) {
        // The access token may have been revoked.
        forget(account);
      }
      return classifyAdminError(error);
    }
  }

  return { send };
}
