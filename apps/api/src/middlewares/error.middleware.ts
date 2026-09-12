import type { FastifyError, FastifyInstance } from "fastify";
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from "fastify-type-provider-zod";

import { httpError } from "../lib/errors.ts";

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

    const statusCode =
      typeof error?.statusCode === "number"
        ? error.statusCode
        : typeof (error as any)?.status === "number"
          ? (error as any).status
          : typeof (error as any)?.error?.statusCode === "number"
            ? (error as any).error.statusCode
            : 500;

    const code =
      error?.code || (error as any)?.error?.code || "INTERNAL_SERVER_ERROR";

    const message =
      typeof error?.message === "string" && error.message.length > 0
        ? error.message
        : typeof (error as any)?.error?.message === "string" &&
            (error as any).error.message.length > 0
          ? (error as any).error.message
          : typeof error === "string"
            ? error
            : "An unexpected error occurred.";

    const issues = (error as any)?.issues ?? (error as any)?.error?.issues;

    if (statusCode >= 500) {
      request.log.error({ err: error }, "Unhandled error");

      return reply
        .code(statusCode)
        .send(httpError(statusCode, code, "An unexpected error occurred."));
    }

    return reply
      .code(statusCode)
      .send(httpError(statusCode, code, message, issues));
  });
}
