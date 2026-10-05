export const GENERIC_API_ERROR_MESSAGE =
  "Something went wrong on our end. Please try again later.";

export interface ApiEnvelope<T = unknown> {
  success: boolean;
  statusCode: number;
  data: T;
}

export interface ApiError {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

const CONFIGURED_BACKEND_URL =
  (typeof import.meta !== "undefined" &&
    (import.meta as unknown as { env?: { VITE_API_BASE_URL?: string } }).env
      ?.VITE_API_BASE_URL) ||
  "/v1";

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
    // Keep configured value
  }

  return CONFIGURED_BACKEND_URL;
}

function isTechnicalApiError(
  status: number,
  code: string,
  message: string,
): boolean {
  return (
    status >= 500 ||
    code.trim().toUpperCase() === "INTERNAL_SERVER_ERROR" ||
    code.trim().toUpperCase() === "ROUTE_NOT_FOUND" ||
    /^Route\s+\w+\s+\/.*\s+does not exist\.?$/i.test(message.trim())
  );
}

function getSafeApiMessage(
  status: number,
  code: string,
  message: string,
): string {
  return isTechnicalApiError(status, code, message)
    ? GENERIC_API_ERROR_MESSAGE
    : message || GENERIC_API_ERROR_MESSAGE;
}

interface HttpErrorLike {
  isAxiosError?: boolean;
  message?: string;
  response?: {
    status?: number;
    data?: { message?: string; code?: string; details?: unknown };
  };
}

export function getApiError(error: unknown): ApiError {
  // The app's fetch-based client marks its errors with the axios-era flag
  // and response layout, so this stays compatible with both.
  if (
    typeof error === "object" &&
    error !== null &&
    (error as HttpErrorLike).isAxiosError === true
  ) {
    const httpError = error as HttpErrorLike;
    const status = httpError.response?.status ?? 500;
    const data = httpError.response?.data;
    const code =
      data?.code || (status >= 500 ? "INTERNAL_SERVER_ERROR" : "API_ERROR");
    const rawMessage =
      data?.message || httpError.message || GENERIC_API_ERROR_MESSAGE;
    const message = getSafeApiMessage(status, code, rawMessage);
    return {
      status,
      code,
      message,
      details: data?.details,
    };
  }

  if (error instanceof Error) {
    return {
      status: 500,
      code: "UNKNOWN_ERROR",
      message: error.message || GENERIC_API_ERROR_MESSAGE,
    };
  }

  return {
    status: 500,
    code: "UNKNOWN_ERROR",
    message: GENERIC_API_ERROR_MESSAGE,
  };
}

function unwrapApiResponseData(data: unknown): unknown {
  if (data && typeof data === "object" && "data" in data && "success" in data) {
    return (data as { data: unknown }).data;
  }
  return data;
}

export interface ApiHttpClient {
  get<T = unknown>(url: string, config?: unknown): Promise<T>;
  post<T = unknown>(url: string, data?: unknown, config?: unknown): Promise<T>;
  put<T = unknown>(url: string, data?: unknown, config?: unknown): Promise<T>;
  patch<T = unknown>(url: string, data?: unknown, config?: unknown): Promise<T>;
  delete<T = unknown>(url: string, config?: unknown): Promise<T>;
}

export type ApiClientInstance = ApiHttpClient;

/**
 * Minimal credentialed fetch client with the same envelope unwrapping and
 * error normalization the previous axios client performed. It exists for
 * consumers that never call setApiClient; the VeoLMS web app injects its own
 * richer client at startup.
 */
export function createApiClient(baseUrl = getApiBaseUrl()): ApiHttpClient {
  const requestUrl = (url: string) =>
    /^https?:\/\//i.test(url)
      ? url
      : `${baseUrl.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;

  async function request<T>(
    method: string,
    url: string,
    data?: unknown,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(requestUrl(url), {
        method,
        credentials: "include",
        headers:
          data !== undefined &&
          !(typeof FormData !== "undefined" && data instanceof FormData)
            ? { "Content-Type": "application/json" }
            : undefined,
        body:
          data === undefined
            ? undefined
            : typeof FormData !== "undefined" && data instanceof FormData
              ? data
              : JSON.stringify(data),
      });
    } catch {
      throw getApiError(
        Object.assign(new Error("Network Error"), { isAxiosError: true }),
      );
    }

    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        body = text;
      }
    }

    if (!response.ok) {
      throw getApiError({
        isAxiosError: true,
        response: { status: response.status, data: body },
      });
    }

    return unwrapApiResponseData(body) as T;
  }

  return {
    get: (url) => request("GET", url),
    post: (url, data) => request("POST", url, data === undefined ? {} : data),
    put: (url, data) => request("PUT", url, data),
    patch: (url, data) => request("PATCH", url, data === undefined ? {} : data),
    delete: (url) => request("DELETE", url),
  };
}

let activeClient: ApiHttpClient | null = null;

export function setApiClient(instance: unknown): void {
  if (instance && typeof instance === "object" && "get" in instance) {
    activeClient = instance as ApiHttpClient;
  }
}

export function getApiClient(): ApiHttpClient {
  // Created lazily so simply importing this module costs nothing at startup.
  activeClient ??= createApiClient();
  return activeClient;
}

export const api = {
  get<T = unknown>(url: string, config?: unknown): Promise<T> {
    return getApiClient().get<T>(url, config);
  },

  post<T = unknown>(url: string, data?: unknown, config?: unknown): Promise<T> {
    return getApiClient().post<T>(url, data === undefined ? {} : data, config);
  },

  put<T = unknown>(url: string, data?: unknown, config?: unknown): Promise<T> {
    return getApiClient().put<T>(url, data, config);
  },

  patch<T = unknown>(
    url: string,
    data?: unknown,
    config?: unknown,
  ): Promise<T> {
    return getApiClient().patch<T>(url, data === undefined ? {} : data, config);
  },

  delete<T = unknown>(url: string, config?: unknown): Promise<T> {
    return getApiClient().delete<T>(url, config);
  },
};

export default api;
