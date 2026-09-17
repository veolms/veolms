import type { FastifyError, FastifyInstance } from "fastify";
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from "fastify-type-provider-zod";

import type { ValidationIssue } from "@veolms/contracts";
import { AppError, httpError } from "../lib/errors.ts";

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
        ),
      ),
  );

  // `TError` defaults to `unknown`, which would leave `error` unusable below.
  app.setErrorHandler<FastifyError>((error, request, reply) => {
    if (reply.sent || reply.raw.headersSent) {
      request.log.error(
        { err: error },
        "Error occurred after response was already sent",
      );
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
        ),
      );
    }

    // The handler returned something its own response schema rejects. That is a
    // server bug, and swallowing it would let the docs drift from reality.
    if (isResponseSerializationError(error)) {
      // The schema/field detail in `error.cause` is internal shape information —
      // log it for debugging, but never hand it to the client.
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
          ),
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
              appError.code,
              "An unexpected error occurred.",
            ),
          );
      }

      return reply
        .code(appError.statusCode)
        .send(
          httpError(
            appError.statusCode,
            appError.code,
            appError.message,
            appError.issues,
          ),
        );
    }

    request.log.error({ err: error }, "Unhandled error");

    return reply
      .code(500)
      .send(
        httpError(
          500,
          "INTERNAL_SERVER_ERROR",
          "An unexpected error occurred.",
        ),
      );
  });
}

