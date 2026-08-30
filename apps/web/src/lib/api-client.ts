import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
} from "axios";
import { getApiError, type ApiError } from "./api-error";
import { authStore } from "../store/auth.store";

export { getApiError, type ApiError };

const BACKEND_URL =
  import.meta.env.VITE_API_BASE_URL || "/api/v1";
const MFA_SETUP_PATH = "/mfa-setup";

function redirectToMfaSetup(apiError: ApiError): void {
  if (
    typeof window === "undefined" ||
    apiError.status !== 403 ||
    apiError.code !== "MFA_REQUIRED"
  ) {
    return;
  }

  const currentPath = window.location.pathname.replace(/\/$/, "") || "/";
  if (currentPath === MFA_SETUP_PATH) return;

  window.location.replace(`${MFA_SETUP_PATH}?mfa=required`);
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
    if (typeof FormData !== "undefined" && config.data instanceof FormData) {
      config.headers.delete("Content-Type");
    }
    return config;
  },
  (error) => Promise.reject(error),
);

axiosInstance.interceptors.response.use(
  (response: AxiosResponse) => {
    if (
      response.data &&
      typeof response.data === "object" &&
      "data" in response.data &&
      "success" in response.data
    ) {
      return response.data.data;
    }
    return response.data;
  },
  (error: AxiosError) => {
    const apiError = getApiError(error);
    redirectToMfaSetup(apiError);
    if (apiError.status === 401 && error.config?.url !== "/auth/login") {
      authStore.clearAuth();
    }
    return Promise.reject(apiError);
  },
);

export const api = {
  get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return axiosInstance.get(url, config) as unknown as Promise<T>;
  },

  post<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    return axiosInstance.post(url, data, config) as unknown as Promise<T>;
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
