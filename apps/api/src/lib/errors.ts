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
  readonly issues?: ValidationIssue[];

  constructor(
    statusCode: number,
    code: string,
    message: string,
    issues?: ValidationIssue[],
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.issues = issues;

    // `name`/`code`/`issues` exist so error.middleware.ts can read them off a
    // thrown AppError, but only `statusCode` is a top-level field in the
    // documented `ErrorResponse` (`code`/`issues` are nested under `.error`
    // there; `name` isn't part of the shape at all). Hide them from
    // JSON.stringify/Object.keys so `httpError()` below can safely add real
    // `success`/`error` properties without leaking these as extra top-level
    // fields whenever its result is `.send()`'d directly. This only flips
    // `enumerable`, so `.name`/`.code`/`.issues` stay readable via normal
    // property access.
    Object.defineProperty(this, "name", { enumerable: false });
    Object.defineProperty(this, "code", { enumerable: false });
    Object.defineProperty(this, "issues", { enumerable: false });
  }
}

export function httpError(
  statusCode: number,
  code: string,
  message: string,
  issues?: ValidationIssue[],
): AppError & ErrorResponse {
  const err = new AppError(statusCode, code, message, issues);
  return Object.assign(err, {
    success: false as const,
    error: { code, message, ...(issues ? { issues } : {}) },
  });
}
