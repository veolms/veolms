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
      request.log.error(
        { err: error },
        "Response did not match its documented schema",
      );

      return reply
        .code(500)
        .send(
          httpError(
            500,
            "RESPONSE_SERIALIZATION_FAILED",
            "The server produced a response that does not match its documented schema.",
          ),
        );
    }

    const statusCode = error.statusCode ?? 500;
    // A plain `Error` thrown from a handler carries no `code`, despite the type.
    const code = error.code || "INTERNAL_SERVER_ERROR";

    if (statusCode >= 500) {
      request.log.error({ err: error }, "Unhandled error");

      return reply
        .code(statusCode)
        .send(httpError(statusCode, code, "An unexpected error occurred."));
    }

    return reply
      .code(statusCode)
      .send(httpError(statusCode, code, error.message));
  });
}
