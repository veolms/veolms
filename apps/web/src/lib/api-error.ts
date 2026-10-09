export const GENERIC_API_ERROR_MESSAGE =
  "Something went wrong on our end. Please try again later.";

export interface ApiError {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

interface HttpErrorLike {
  isAxiosError?: boolean;
  code?: string;
  response?: {
    status?: number;
    data?: {
      message?: string;
      code?: string;
      error?: { message?: string; code?: string };
    };
  };
}

/**
 * The fetch-based API client marks its errors with the same `isAxiosError`
 * flag (and response/config layout) the axios client used, so this check is
 * equivalent to the axios.isAxiosError call it replaces without pulling
 * axios into the startup bundle.
 */
function isHttpClientError(error: unknown): error is HttpErrorLike {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as HttpErrorLike).isAxiosError === true
  );
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

/**
 * The API client already rejects with a normalised `ApiError`. A caller that
 * passes that rejection through `getApiError` again must get it back as is;
 * treating it as an unknown value replaced its code and message with the
 * generic ones.
 */
function isNormalisedApiError(error: unknown): error is ApiError {
  if (typeof error !== "object" || error === null || error instanceof Error) {
    return false;
  }
  const candidate = error as Partial<ApiError>;
  return (
    typeof candidate.status === "number" &&
    typeof candidate.code === "string" &&
    typeof candidate.message === "string"
  );
}

export function getApiError(error: unknown): ApiError {
  if (isNormalisedApiError(error)) return error;

  if (isHttpClientError(error)) {
    const data = error.response?.data;
    const status = error.response?.status || 500;
    const code =
      data?.error?.code || data?.code || error.code || "UNKNOWN_ERROR";

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
