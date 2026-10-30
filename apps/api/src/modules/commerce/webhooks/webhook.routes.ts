import { z } from "zod";
import { jsonResponse } from "../../../lib/responses.ts";
import { errorResponse } from "../../../lib/errors.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { createWebhookService } from "./webhook.service.ts";
import { createWebhookController } from "./webhook.controller.ts";

declare module "fastify" {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}

const webhookRoutes: RoutePlugin = async (app, options) => {
  // Retain the raw byte buffer for HMAC signature verification (gateway
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

  const service = createWebhookService({
    database: options.database,
    paymentGateways: options.services.paymentGateways,
    eventQueue: options.paymentEventQueue,
  });

  const controller = createWebhookController({ service });

  // POST /webhooks/:provider - Ingestion endpoint for a payment gateway's
  // webhook events: /webhooks/razorpay, /webhooks/dodo.
  app.post(
    "/webhooks/:provider",
    {
      schema: {
        operationId: "handleGatewayWebhook",
        tags: ["Commerce - Webhooks"],
        summary: "Ingest a payment gateway's webhook events",
        description:
          "Verifies the webhook signature of the gateway named in the path (razorpay, dodo), deduplicates event, and queues payment fulfillment in background.",
        params: z.object({ provider: z.string().min(1).max(40) }),
        response: {
          200: jsonResponse(
            "Webhook received successfully",
            z.object({
              received: z.boolean(),
              eventId: z.string(),
            }),
          ),
          400: errorResponse("Invalid webhook signature or payload"),
        },
      },
    },
    controller.handleGatewayWebhook,
  );
};

export default webhookRoutes;
