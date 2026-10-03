import type { ErrorResponse, ValidationIssue } from "@veolms/contracts";
import type { FastifyError, FastifyInstance } from "fastify";
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from "fastify-type-provider-zod";

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
  readonly success = false as const;
  readonly statusCode: number;
  readonly code: string;
  readonly issues?: ValidationIssue[];

  get error(): { code: string; message: string; issues?: ValidationIssue[] } {
    return {
      code: this.code,
      message: this.message,
      ...(this.issues ? { issues: this.issues } : {}),
    };
  }

  constructor(statusCode: number, code: string, message: string, issues?: ValidationIssue[]) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.issues = issues;
  }

  toJSON(): ErrorResponse {
    return {
      success: false as const,
      statusCode: this.statusCode,
      error: {
        code: this.code,
        message: this.message,
        ...(this.issues ? { issues: this.issues } : {}),
      },
    };
  }
}

export function httpError(
  statusCode: number,
  code: string,
  message: string,
  issues?: ValidationIssue[],
): AppError {
  return new AppError(statusCode, code, message, issues);
}

/**
 * Makes every failure share the documented `ErrorResponse` shape, so the error
 * responses routes declare are the ones clients actually receive.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) =>
    reply
      .code(404)
      .send(
        httpError(
          404,
          "ROUTE_NOT_FOUND",
          `Route ${request.method} ${request.url} does not exist.`,
        ).toJSON(),
      ),
  );

  app.setErrorHandler<FastifyError>((error, request, reply) => {
    if (reply.sent || reply.raw.headersSent) {
      request.log.error({ err: error }, "Error occurred after response was already sent");
      return;
    }

    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.code(400).send(
        httpError(
          400,
          "REQUEST_VALIDATION_FAILED",
          "The request does not match the documented schema.",
          error.validation.map((issue) => ({
            path: issue.instancePath,
            message: issue.message ?? "Invalid value.",
          })),
        ).toJSON(),
      );
    }

    if (isResponseSerializationError(error)) {
      request.log.error(
        { err: error, cause: error.cause },
        "Response did not match its documented schema",
      );

      return reply
        .code(500)
        .send(
          httpError(
            500,
            "RESPONSE_SERIALIZATION_FAILED",
            "The server produced an invalid response.",
          ).toJSON(),
        );
    }

    const appError =
      error instanceof AppError
        ? error
        : typeof error === "object" &&
            error !== null &&
            ("statusCode" in error || "status" in error || "code" in error)
          ? new AppError(
              Number(
                (error as { statusCode?: unknown }).statusCode ||
                  (error as { status?: unknown }).status ||
                  500,
              ),
              String(
                (error as { code?: unknown }).code ||
                  (error as { error?: { code?: unknown } }).error?.code ||
                  "ERROR",
              ),
              String(
                (error as { message?: unknown }).message ||
                  (error as { error?: { message?: unknown } }).error?.message ||
                  "An unexpected error occurred.",
              ),
              (error as { issues?: ValidationIssue[] }).issues ||
                (error as { error?: { issues?: ValidationIssue[] } }).error?.issues,
            )
          : null;

    if (appError) {
      if (appError.statusCode >= 500) {
        request.log.error({ err: error }, "Unhandled error");

        return reply
          .code(appError.statusCode)
          .send(
            httpError(
              appError.statusCode,
              error instanceof AppError ? appError.code : "INTERNAL_SERVER_ERROR",
              "An unexpected error occurred.",
            ).toJSON(),
          );
      }

      return reply
        .code(appError.statusCode)
        .send(
          httpError(appError.statusCode, appError.code, appError.message, appError.issues).toJSON(),
        );
    }

    request.log.error({ err: error }, "Unhandled error");

    return reply
      .code(500)
      .send(httpError(500, "INTERNAL_SERVER_ERROR", "An unexpected error occurred.").toJSON());
  });
}
