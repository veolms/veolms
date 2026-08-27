import { z } from "zod";
import { jsonResponse } from "../../../lib/responses.ts";
import { errorResponse } from "../../../lib/errors.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { createWebhookService } from "./webhook.service.ts";
import { createWebhookController } from "./webhook.controller.ts";

const webhookRoutes: RoutePlugin = async (app, options) => {
  // Retain the raw byte buffer for HMAC signature verification (Razorpay
  // webhooks). Registered here rather than app-wide: Fastify scopes content
  // type parsers to the plugin (and its children) they're registered in, so
  // this only affects requests to routes registered below — every other
  // route in the API keeps the default JSON parser instead of holding both
  // the raw buffer and the parsed body in memory on every request.
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (req, body: Buffer, done) => {
      (req as any).rawBody = body;
      if (body.length === 0) {
        done(null, null);
        return;
      }
      try {
        const json = JSON.parse(body.toString("utf-8"));
        done(null, json);
      } catch (err: any) {
        err.statusCode = 400;
        done(err, undefined);
      }
    },
  );

  const service = createWebhookService({
    database: options.database,
    paymentGateway: options.services.paymentGateway,
    eventQueue: options.paymentEventQueue,
  });

  const controller = createWebhookController({ service });

  // POST /webhooks/razorpay - Ingestion endpoint for Razorpay webhook events
  app.post(
    "/webhooks/razorpay",
    {
      schema: {
        operationId: "handleRazorpayWebhook",
        tags: ["Commerce - Webhooks"],
        summary: "Ingest Razorpay webhook events",
        description: "Verifies webhook signature, deduplicates event, and queues payment fulfillment in background.",
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
    controller.handleRazorpayWebhook,
  );
};

export default webhookRoutes;
