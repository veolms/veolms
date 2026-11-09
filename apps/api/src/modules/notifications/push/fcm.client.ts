import crypto from "node:crypto";

import type { ServiceAccount } from "./push-apps.ts";

/**
 * Firebase Cloud Messaging over its HTTP v1 API, signed in with a service
 * account (an OAuth access token from a signed JWT, cached until shortly
 * before it expires). No SDK: one POST per install.
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

const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const REQUEST_TIMEOUT_MS = 10_000;
/** Renew the access token this long before it expires. */
const TOKEN_MARGIN_MS = 5 * 60 * 1000;

function base64Url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

/** The signed JWT exchanged for an access token (RS256). */
export function createServiceAccountAssertion(
  account: ServiceAccount,
  nowSeconds: number,
): string {
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(
    JSON.stringify({
      iss: account.clientEmail,
      scope: SCOPE,
      aud: account.tokenUri,
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    }),
  );
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(`${header}.${claims}`)
    .sign(account.privateKey);
  return `${header}.${claims}.${base64Url(signature)}`;
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(value);
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

export function createFcmClient({
  endpoint = "https://fcm.googleapis.com",
  fetchImpl = fetch,
}: {
  endpoint?: string;
  fetchImpl?: typeof fetch;
} = {}): FcmClient {
  const tokens = new Map<string, { token: string; expiresAt: number }>();
  const pending = new Map<string, Promise<string>>();

  async function fetchAccessToken(account: ServiceAccount): Promise<string> {
    const assertion = createServiceAccountAssertion(
      account,
      Math.floor(Date.now() / 1000),
    );
    const response = await fetchImpl(account.tokenUri, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = (await response.json().catch(() => null)) as {
      access_token?: string;
      expires_in?: number;
      error_description?: string;
      error?: string;
    } | null;
    if (!response.ok || !body?.access_token) {
      const reason =
        body?.error_description ?? body?.error ?? `HTTP ${response.status}`;
      throw new FcmAuthError(`Firebase sign-in failed: ${reason}`);
    }
    tokens.set(account.clientEmail, {
      token: body.access_token,
      expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
    });
    return body.access_token;
  }

  async function accessToken(account: ServiceAccount): Promise<string> {
    const cached = tokens.get(account.clientEmail);
    if (cached && cached.expiresAt - TOKEN_MARGIN_MS > Date.now()) {
      return cached.token;
    }
    // Many sends at once share one sign-in.
    let inFlight = pending.get(account.clientEmail);
    if (!inFlight) {
      inFlight = fetchAccessToken(account).finally(() =>
        pending.delete(account.clientEmail),
      );
      pending.set(account.clientEmail, inFlight);
    }
    return await inFlight;
  }

  async function send(
    account: ServiceAccount,
    body: { message: Record<string, unknown> },
  ): Promise<FcmOutcome> {
    let token: string;
    try {
      token = await accessToken(account);
    } catch (error) {
      if (error instanceof FcmAuthError) {
        return { ok: false, kind: "auth", error: error.message };
      }
      return {
        ok: false,
        kind: "retry",
        error: `Firebase sign-in unreachable: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    let response: Response;
    try {
      response = await fetchImpl(
        `${endpoint.replace(/\/$/u, "")}/v1/projects/${encodeURIComponent(account.projectId)}/messages:send`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      );
    } catch (error) {
      return {
        ok: false,
        kind: "retry",
        error: `Firebase unreachable: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    if (response.ok) {
      const result = (await response.json().catch(() => null)) as {
        name?: string;
      } | null;
      return { ok: true, messageId: result?.name ?? "" };
    }
    if (response.status === 401) {
      // The cached access token may have been revoked: sign in afresh next time.
      tokens.delete(account.clientEmail);
    }
    const errorBody = (await response
      .json()
      .catch(() => null)) as FcmErrorBody | null;
    return classifyFcmError(
      response.status,
      errorBody,
      parseRetryAfter(response.headers.get("retry-after")),
    );
  }

  return { send };
}

class FcmAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FcmAuthError";
  }
}
