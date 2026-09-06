import axios, { type AxiosError } from "axios";

export const GENERIC_API_ERROR_MESSAGE =
  "Something went wrong on our end. Please try again later.";

export interface ApiError {
  status: number;
  code: string;
  message: string;
  details?: unknown;
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

function getSafeApiMessage(status: number, code: string, message: string) {
  return isTechnicalApiError(status, code, message)
    ? GENERIC_API_ERROR_MESSAGE
    : message || GENERIC_API_ERROR_MESSAGE;
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
      data?.error?.code || data?.code || axiosError.code || "UNKNOWN_ERROR";

    const message =
      data?.error?.message || data?.message || GENERIC_API_ERROR_MESSAGE;

    return {
      status,
      code,
      message: getSafeApiMessage(status, code, message),
      details: data,
    };
  }

  if (error instanceof Error) {
    return {
      status: 500,
      code: "UNKNOWN_ERROR",
      message: GENERIC_API_ERROR_MESSAGE,
    };
  }

  return {
    status: 500,
    code: "UNKNOWN_ERROR",
    message: GENERIC_API_ERROR_MESSAGE,
  };
}
