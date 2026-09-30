import { jsonResponse } from "../../../lib/responses.ts";
import { errorResponse } from "../../../lib/errors.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { createMediaService } from "../media.service.ts";
import { createMediaController } from "../media.controller.ts";
import {
  mediaConvertWebhookPayloadSchema,
  mediaConvertWebhookResponseSchema,
} from "./mediaconvert-webhook.schema.ts";

declare module "fastify" {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}

const mediaconvertWebhookRoutes: RoutePlugin = async (app, options) => {
  // Retain the raw byte buffer for HMAC signature verification (MediaConvert
  // webhooks). Registered here rather than app-wide: Fastify scopes content
  // type parsers to the plugin (and its children) they're registered in, so
  // this only affects requests to routes registered below — every other
  // route in the API keeps the default JSON parser instead of holding both
  // the raw buffer and the parsed body in memory on every request.
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (req, body: Buffer, done) => {
      req.rawBody = body;
      if (body.length === 0) {
        done(null, null);
        return;
      }
      try {
        const json = JSON.parse(body.toString("utf-8"));
        done(null, json);
      } catch (err: unknown) {
        const parseErr = (
          err instanceof Error ? err : new Error("Invalid JSON")
        ) as Error & {
          statusCode?: number;
        };
        parseErr.statusCode = 400;
        done(parseErr, undefined);
      }
    },
  );

  const service = createMediaService({
    database: options.database,
    services: options.services,
  });

  const controller = createMediaController({ service });

  // POST /webhooks/mediaconvert - Ingestion endpoint for AWS MediaConvert webhook events
  app.post(
    "/webhooks/mediaconvert",
    {
      schema: {
        operationId: "handleMediaConvertWebhook",
        tags: ["Media - Webhooks"],
        summary: "Ingest AWS MediaConvert state change webhook events",
        description:
          "Verifies webhook signature (if secret configured) and updates video job status and media readiness.",
        body: mediaConvertWebhookPayloadSchema,
        response: {
          200: jsonResponse(
            "Webhook processed successfully",
            mediaConvertWebhookResponseSchema,
          ),
          400: errorResponse("Invalid webhook payload"),
          401: errorResponse("Invalid signature"),
        },
      },
    },
    controller.handleMediaConvertWebhook,
  );
};

export default mediaconvertWebhookRoutes;
