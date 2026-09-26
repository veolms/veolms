import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
} from "axios";
import { getApiError, type ApiError } from "./api-error";
import { authStore } from "../store/auth.store";
import { interactionCreationCoordinator } from "../services/learning-interactions/interaction-creation-coordinator";
import { desiredStateCoordinator } from "../services/learning-interactions/desired-state-coordinator";
import { optimisticDeletionCoordinator } from "../services/learning-interactions/optimistic-deletion-coordinator";
import {
  buildMfaChallengePath,
  shouldRedirectToMfaChallenge,
} from "../routing/routeAccess";
import { isReactRouterBuildRequest } from "./react-router-build";

export { getApiError, type ApiError };

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

function redirectToMfaSetup(apiError: ApiError): void {
  if (typeof window === "undefined") {
    return;
  }

  const currentPath = window.location.pathname.replace(/\/$/, "") || "/";
  if (!shouldRedirectToMfaChallenge(currentPath, apiError)) {
    return;
  }

  const returnTo = `${currentPath}${window.location.search}`;
  window.location.replace(buildMfaChallengePath(returnTo));
}
const axiosInstance: AxiosInstance = axios.create({
  baseURL: BACKEND_URL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

axiosInstance.interceptors.request.use(
  (config) => {
    if (isReactRouterBuildRequest()) {
      return Promise.reject(
        Object.assign(
          new Error("API requests are disabled during prerender."),
          {
            config,
          },
        ),
      );
    }
    if (typeof FormData !== "undefined" && config.data instanceof FormData) {
      config.headers.delete("Content-Type");
    }
    return config;
  },
  (error) => Promise.reject(error),
);

function shouldClearAuthOnUnauthorized(
  error: AxiosError,
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

  const url = error.config?.url;
  if (!url) {
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

function isHtmlDocumentResponse(response: AxiosResponse): boolean {
  return (
    typeof response.data === "string" &&
    /^\s*(?:<!doctype\s+html|<html(?:\s|>))/iu.test(response.data)
  );
}

function normalizeApiResponse(response: AxiosResponse) {
  if (isHtmlDocumentResponse(response)) {
    const error = Object.assign(
      new Error("The API endpoint returned an HTML document instead of JSON."),
      {
        isAxiosError: true,
        config: response.config,
        response: {
          ...response,
          status: 502,
          statusText: "Bad Gateway",
          data: {
            code: "INVALID_API_RESPONSE",
            message:
              "The API endpoint returned an HTML document instead of JSON.",
          },
        },
      },
    ) as AxiosError;
    throw error;
  }

  if (
    response.data &&
    typeof response.data === "object" &&
    "data" in response.data &&
    "success" in response.data
  ) {
    return response.data.data;
  }
  return response.data;
}

axiosInstance.interceptors.response.use(normalizeApiResponse);

axiosInstance.interceptors.response.use(undefined, (error: AxiosError) => {
  const apiError = getApiError(error);
  redirectToMfaSetup(apiError);
  if (shouldClearAuthOnUnauthorized(error, apiError)) {
    authStore.clearAuth();
    desiredStateCoordinator.reset();
    interactionCreationCoordinator.reset();
    optimisticDeletionCoordinator.reset();
  }
  return Promise.reject(apiError);
});

export const api = {
  get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return axiosInstance.get(url, config) as unknown as Promise<T>;
  },

  post<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    // Fastify rejects an empty request when the client advertises
    // `application/json`. Treat a no-body POST as an empty JSON object so
    // action endpoints (publish, logout, retry, etc.) work consistently.
    return axiosInstance.post(
      url,
      data === undefined ? {} : data,
      config,
    ) as unknown as Promise<T>;
  },

  put<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    return axiosInstance.put(url, data, config) as unknown as Promise<T>;
  },

  patch<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    return axiosInstance.patch(url, data, config) as unknown as Promise<T>;
  },

  delete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return axiosInstance.delete(url, config) as unknown as Promise<T>;
  },
};

export default api;
