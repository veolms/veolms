import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";

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

export function getApiError(error: unknown): ApiError {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{
      message?: string;
      code?: string;
      details?: unknown;
    }>;
    const status = axiosError.response?.status ?? 500;
    const data = axiosError.response?.data;
    const code =
      data?.code || (status >= 500 ? "INTERNAL_SERVER_ERROR" : "API_ERROR");
    const rawMessage =
      data?.message || axiosError.message || GENERIC_API_ERROR_MESSAGE;
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

export function createApiClient(baseUrl = getApiBaseUrl()): AxiosInstance {
  const instance = axios.create({
    baseURL: baseUrl,
    withCredentials: true,
    headers: {
      "Content-Type": "application/json",
    },
  });

  instance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    if (typeof FormData !== "undefined" && config.data instanceof FormData) {
      config.headers.delete("Content-Type");
    }
    return config;
  });

  instance.interceptors.response.use(
    (response: AxiosResponse) =>
      unwrapApiResponseData(response.data) as AxiosResponse["data"],
    (error: unknown) => Promise.reject(getApiError(error)),
  );

  return instance;
}

export interface ApiHttpClient {
  get<T = unknown>(url: string, config?: unknown): Promise<T>;
  post<T = unknown>(url: string, data?: unknown, config?: unknown): Promise<T>;
  put<T = unknown>(url: string, data?: unknown, config?: unknown): Promise<T>;
  patch<T = unknown>(url: string, data?: unknown, config?: unknown): Promise<T>;
  delete<T = unknown>(url: string, config?: unknown): Promise<T>;
}

export type ApiClientInstance = AxiosInstance | ApiHttpClient;

let activeAxiosInstance: AxiosInstance = createApiClient();

export function setApiClient(instance: unknown): void {
  if (instance && typeof instance === "object" && "get" in instance) {
    activeAxiosInstance = instance as AxiosInstance;
  }
}

export function getApiClient(): AxiosInstance {
  return activeAxiosInstance;
}

export const api = {
  get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return activeAxiosInstance.get(url, config) as unknown as Promise<T>;
  },

  post<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    return activeAxiosInstance.post(
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
    return activeAxiosInstance.put(url, data, config) as unknown as Promise<T>;
  },

  patch<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    return activeAxiosInstance.patch(
      url,
      data === undefined ? {} : data,
      config,
    ) as unknown as Promise<T>;
  },

  delete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return activeAxiosInstance.delete(url, config) as unknown as Promise<T>;
  },
};

export default api;
