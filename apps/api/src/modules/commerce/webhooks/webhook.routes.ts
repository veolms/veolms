import { z } from "zod";
import { jsonResponse } from "../../../lib/responses.ts";
import { errorResponse } from "../../../lib/errors.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { BackgroundPaymentEventQueue } from "./payment-event.queue.ts";
import { createPaymentEventProcessor } from "./payment-event.processor.ts";
import { createWebhookService } from "./webhook.service.ts";
import { createWebhookController } from "./webhook.controller.ts";

const webhookRoutes: RoutePlugin = async (app, options) => {
  const processor = createPaymentEventProcessor({ database: options.database });
  const eventQueue = new BackgroundPaymentEventQueue({
    logger: app.log,
    handler: processor.processEvent,
  });

  const service = createWebhookService({
    database: options.database,
    paymentGateway: options.services.paymentGateway,
    eventQueue,
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
