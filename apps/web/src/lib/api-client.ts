import { getApiError, type ApiError } from "./api-error";
import { authStore } from "../store/auth.store";
import { authKeys } from "../services/auth/auth.keys";
import { queryClient } from "./query-client";
import { resetRegisteredInteractionState } from "../services/learning-interactions/interaction-reset-registry";
import {
  buildMfaChallengePath,
  shouldRedirectToMfaChallenge,
} from "../routing/routeAccess";
import { isReactRouterBuildRequest } from "./react-router-build";
import { shouldFollowMfaRequired } from "../store/pendingMfaLogin";
import { setApiClient } from "@veolms/web-core";

export { getApiError, type ApiError };

/**
 * Fetch-based HTTP client with the same observable behavior as the axios
 * client it replaced (axios was ~35KB of compressed startup JavaScript on
 * every page):
 * - credentialed JSON requests against the configured /v1 base URL;
 * - axios-compatible query-parameter serialization;
 * - success bodies are JSON-parsed when possible and the standard
 *   { success, data } envelope is unwrapped;
 * - an HTML document in a success response is surfaced as the same 502
 *   INVALID_API_RESPONSE error;
 * - failures reject with the normalized ApiError, after the MFA redirect
 *   and session-loss handling the axios interceptors performed;
 * - error codes mirror axios ("ECONNABORTED" timeout, "ERR_NETWORK",
 *   "ERR_CANCELED") so existing error handling keeps working.
 */

export interface ApiRequestConfig {
  /**
   * Query parameters, serialized like axios' default serializer. Typed as
   * `object` (like axios' `any`) so plain interfaces without an index
   * signature remain assignable.
   */
  params?: object;
  signal?: AbortSignal;
  /** Milliseconds before the request aborts with code ECONNABORTED. */
  timeout?: number;
  headers?: Record<string, string>;
}

const CONFIGURED_BACKEND_URL = import.meta.env.VITE_API_BASE_URL || "/v1";

function isPrivateIpv4Address(hostname: string): boolean {
  const octets = hostname.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }

  const firstOctet = octets[0] ?? -1;
  const secondOctet = octets[1] ?? -1;
  return (
    firstOctet === 10 ||
    (firstOctet === 172 && secondOctet >= 16 && secondOctet <= 31) ||
    (firstOctet === 192 && secondOctet === 168)
  );
}

/** Replace loopback with the host serving the app when opened over LAN. */
export function getApiBaseUrl(): string {
  if (
    typeof window === "undefined" ||
    !isPrivateIpv4Address(window.location.hostname)
  ) {
    return CONFIGURED_BACKEND_URL;
  }

  try {
    const configuredUrl = new URL(
      CONFIGURED_BACKEND_URL,
      window.location.origin,
    );
    if (
      (configuredUrl.hostname === "localhost" ||
        configuredUrl.hostname === "127.0.0.1") &&
      configuredUrl.protocol === "http:"
    ) {
      configuredUrl.hostname = window.location.hostname;
      return configuredUrl.toString().replace(/\/$/u, "");
    }
  } catch {
    // Keep the configured value if it is not a valid URL.
  }

  return CONFIGURED_BACKEND_URL;
}

const BACKEND_URL = getApiBaseUrl();

export function getApiRequestUrl(path: string): string {
  return `${BACKEND_URL.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

/**
 * Error shape produced by this client before normalization. It carries the
 * axios marker and layout (response/config/code) so getApiError and any
 * axios-era error handling keep reading it exactly as before.
 */
interface ApiHttpError extends Error {
  isAxiosError: true;
  code?: string;
  config?: { url?: string };
  response?: {
    status: number;
    statusText?: string;
    data: unknown;
  };
}

function createHttpError(
  message: string,
  properties: Omit<ApiHttpError, keyof Error | "isAxiosError">,
): ApiHttpError {
  return Object.assign(new Error(message), {
    isAxiosError: true as const,
    ...properties,
  });
}

/** Matches axios' default serializer for the parameter shapes we send. */
function serializeParams(params: object): string {
  const search = new URLSearchParams();
  const append = (key: string, value: unknown) => {
    if (value === null || value === undefined) return;
    if (value instanceof Date) {
      search.append(key, value.toISOString());
      return;
    }
    if (typeof value === "object") {
      search.append(key, JSON.stringify(value));
      return;
    }
    search.append(key, String(value));
  };

  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) append(`${key}[]`, item);
      continue;
    }
    append(key, value);
  }
  return search.toString();
}

function buildRequestUrl(url: string, params?: object) {
  let requestUrl = /^https?:\/\//i.test(url) ? url : getApiRequestUrl(url);
  if (params) {
    const query = serializeParams(params);
    if (query) {
      requestUrl += (requestUrl.includes("?") ? "&" : "?") + query;
    }
  }
  return requestUrl;
}

function combineSignals(
  requestSignal: AbortSignal | undefined,
  timeout: number | undefined,
): { signal: AbortSignal | undefined; didTimeout: () => boolean } {
  let timedOut = false;
  if (!timeout) {
    return { signal: requestSignal, didTimeout: () => false };
  }

  const controller = new AbortController();
  window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeout);
  if (requestSignal) {
    if (requestSignal.aborted) controller.abort();
    else
      requestSignal.addEventListener("abort", () => controller.abort(), {
        once: true,
      });
  }
  return { signal: controller.signal, didTimeout: () => timedOut };
}

function redirectToMfaSetup(apiError: ApiError): void {
  if (typeof window === "undefined") {
    return;
  }

  const currentPath = window.location.pathname.replace(/\/$/, "") || "/";
  if (!shouldRedirectToMfaChallenge(currentPath, apiError)) {
    return;
  }
  // Not when the route guards already know and are dealing with it: for a
  // sign-in that was walked away from they end the session, and sending the
  // tab to the two-factor step here would bring that sign-in back.
  if (!shouldFollowMfaRequired(queryClient.getQueryData(authKeys.me()))) {
    return;
  }

  const returnTo = `${currentPath}${window.location.search}`;
  window.location.replace(buildMfaChallengePath(returnTo));
}

function shouldClearAuthOnUnauthorized(
  url: string,
  apiError: ApiError,
): boolean {
  if (apiError.status !== 401) {
    return false;
  }

  // An invalid credential, bad OTP code, or MFA challenge does not mean the
  // existing session expired. Never clear auth for user input mistakes during
  // login, verification, or step-up flows.
  if (
    apiError.code === "INVALID_CODE" ||
    apiError.code === "INVALID_CREDENTIALS" ||
    apiError.code === "MFA_REQUIRED" ||
    apiError.code === "TOTP_REQUIRED" ||
    apiError.code === "PASSKEY_REQUIRED"
  ) {
    return false;
  }

  const authInputEndpoints = [
    "/auth/login",
    "/auth/otp/verify",
    "/auth/me/phone/otp/verify",
    "/auth/me/email/otp/verify",
    "/auth/totp/verify",
    "/auth/totp/enable",
    "/auth/passkey/login/verify",
    "/auth/passkey/register/verify",
    "/auth/mfa/step-up",
  ];

  if (authInputEndpoints.some((endpoint) => url.includes(endpoint))) {
    return false;
  }

  const isExplicitSessionFailure =
    apiError.code === "UNAUTHORIZED" ||
    apiError.code === "UNAUTHENTICATED" ||
    apiError.code === "SESSION_EXPIRED" ||
    apiError.code === "NO_SESSION" ||
    apiError.code === "SESSION_REVOKED";

  return isExplicitSessionFailure || url.endsWith("/auth/me");
}

function isHtmlDocumentBody(body: unknown): boolean {
  return (
    typeof body === "string" &&
    /^\s*(?:<!doctype\s+html|<html(?:\s|>))/iu.test(body)
  );
}

function unwrapApiResponseData(data: unknown) {
  if (data && typeof data === "object" && "data" in data && "success" in data) {
    return (data as { data: unknown }).data;
  }
  return data;
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  // axios attempted JSON.parse on every textual body and silently kept the
  // raw string when parsing failed; the API always answers JSON.
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function request<T>(
  method: string,
  url: string,
  data: unknown,
  config: ApiRequestConfig = {},
): Promise<T> {
  if (isReactRouterBuildRequest()) {
    // The axios pipeline routed this rejection through getApiError too, so
    // prerender callers saw a normalized 500/UNKNOWN_ERROR ApiError.
    return Promise.reject(
      getApiError(new Error("API requests are disabled during prerender.")),
    );
  }

  const requestUrl = buildRequestUrl(url, config.params);
  const headers = new Headers(config.headers);
  let body: BodyInit | undefined;
  if (data !== undefined) {
    if (typeof FormData !== "undefined" && data instanceof FormData) {
      body = data; // fetch sets the multipart boundary header itself.
    } else {
      if (!headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }
      body = JSON.stringify(data);
    }
  }

  const { signal, didTimeout } = combineSignals(config.signal, config.timeout);

  let response: Response;
  try {
    response = await fetch(requestUrl, {
      method,
      credentials: "include",
      headers,
      body,
      signal,
    });
  } catch (error) {
    const aborted =
      error instanceof DOMException && error.name === "AbortError";
    const code = aborted
      ? didTimeout()
        ? "ECONNABORTED"
        : "ERR_CANCELED"
      : "ERR_NETWORK";
    const message =
      code === "ECONNABORTED"
        ? `timeout of ${config.timeout}ms exceeded`
        : code === "ERR_CANCELED"
          ? "canceled"
          : "Network Error";
    throw getApiError(createHttpError(message, { code, config: { url } }));
  }

  const responseBody = await readResponseBody(response);

  if (!response.ok) {
    const apiError = getApiError(
      createHttpError(`Request failed with status code ${response.status}`, {
        config: { url },
        response: {
          status: response.status,
          statusText: response.statusText,
          data: responseBody,
        },
      }),
    );
    redirectToMfaSetup(apiError);
    if (shouldClearAuthOnUnauthorized(url, apiError)) {
      authStore.clearAuth();
      // The route guards also read the cached current user. Left in place,
      // it kept the signed-in shell on screen — every request failing —
      // until that cache next refreshed, minutes later.
      queryClient.setQueryData(authKeys.me(), null);
      resetRegisteredInteractionState();
    }
    throw apiError;
  }

  if (isHtmlDocumentBody(responseBody)) {
    throw getApiError(
      createHttpError(
        "The API endpoint returned an HTML document instead of JSON.",
        {
          config: { url },
          response: {
            status: 502,
            statusText: "Bad Gateway",
            data: {
              code: "INVALID_API_RESPONSE",
              message:
                "The API endpoint returned an HTML document instead of JSON.",
            },
          },
        },
      ),
    );
  }

  return unwrapApiResponseData(responseBody) as T;
}

export const api = {
  get<T = unknown>(url: string, config?: ApiRequestConfig): Promise<T> {
    return request<T>("GET", url, undefined, config);
  },

  post<T = unknown>(
    url: string,
    data?: unknown,
    config?: ApiRequestConfig,
  ): Promise<T> {
    // Fastify rejects an empty request when the client advertises
    // `application/json`. Treat a no-body POST as an empty JSON object so
    // action endpoints (publish, logout, retry, etc.) work consistently.
    return request<T>("POST", url, data === undefined ? {} : data, config);
  },

  put<T = unknown>(
    url: string,
    data?: unknown,
    config?: ApiRequestConfig,
  ): Promise<T> {
    return request<T>("PUT", url, data, config);
  },

  patch<T = unknown>(
    url: string,
    data?: unknown,
    config?: ApiRequestConfig,
  ): Promise<T> {
    return request<T>("PATCH", url, data, config);
  },

  delete<T = unknown>(url: string, config?: ApiRequestConfig): Promise<T> {
    return request<T>("DELETE", url, undefined, config);
  },
};

setApiClient(api);

export default api;
