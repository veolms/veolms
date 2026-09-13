import type { FastifyError, FastifyInstance } from "fastify";
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from "fastify-type-provider-zod";

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

    if (error instanceof AppError) {
      if (error.statusCode >= 500) {
        request.log.error({ err: error }, "Unhandled error");

        return reply
          .code(error.statusCode)
          .send(
            httpError(
              error.statusCode,
              error.code,
              "An unexpected error occurred.",
            ),
          );
      }

      return reply
        .code(error.statusCode)
        .send(
          httpError(error.statusCode, error.code, error.message, error.issues),
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

