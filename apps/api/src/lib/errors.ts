import {
  errorResponseSchema,
  type ErrorResponse,
  type ValidationIssue,
} from "@veolms/contracts";

import { errorJsonResponse } from "./responses.ts";

export type { ErrorResponse, ValidationIssue };

export function errorResponse(description: string) {
  return errorJsonResponse(description, errorResponseSchema);
}

/**
 * A failure a handler can raise from anywhere in the call stack and have
 * rendered as the documented `ErrorResponse`.
 *
 * `registerErrorHandler` already maps `statusCode`/`code`/`message` off thrown
 * errors, so service and repository code can signal failures by throwing rather
 * than by being handed a `reply` to write to. That keeps business logic free of
 * transport concerns and makes it callable outside a request.
 *
 * Note that only sub-500 messages reach the client; the handler replaces 5xx
 * messages with a generic string so internals are never disclosed.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function httpError(
  statusCode: number,
  code: string,
  message: string,
  issues?: ValidationIssue[],
): ErrorResponse {
  return {
    success: false,
    statusCode,
    error: {
      code,
      message,
      ...(issues ? { issues } : {}),
    },
  };
}
