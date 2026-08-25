import axios, { type AxiosError } from "axios";

export interface ApiError {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

export function getApiError(error: unknown): ApiError {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{
      message?: string;
      code?: string;
      error?: { message?: string; code?: string };
    }>;

    const data = axiosError.response?.data;
    const status = axiosError.response?.status || 500;
    const code =
      data?.error?.code ||
      data?.code ||
      axiosError.code ||
      "UNKNOWN_ERROR";

    const message =
      data?.error?.message ||
      data?.message ||
      "Something went wrong. Please try again.";

    return { status, code, message, details: data };
  }

  if (error instanceof Error) {
    return {
      status: 500,
      code: "UNKNOWN_ERROR",
      message: error.message || "Something went wrong. Please try again.",
    };
  }

  return {
    status: 500,
    code: "UNKNOWN_ERROR",
    message: "Something went wrong. Please try again.",
  };
}
