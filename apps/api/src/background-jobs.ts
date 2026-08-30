import type { FastifyInstance } from "fastify";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";
import type { AppServices } from "./services/index.ts";
import { createPaymentWorker } from "./modules/commerce/fulfillment/payment.worker.ts";
import {
  BackgroundPaymentEventQueue,
  type PaymentEventQueue,
} from "./modules/commerce/webhooks/payment-event.queue.ts";
import { CommerceFulfillmentScheduler } from "./modules/commerce/fulfillment/fulfillment.scheduler.ts";

export interface BackgroundJobsOptions {
  database: Kysely<Database>;
  services: AppServices;
}

/**
 * Centralized bootstrap for every commerce background poller.
 *
 * Both of these used to be started as a side effect of registering an
 * unrelated route plugin (payment.routes.ts for the fulfillment scheduler,
 * webhooks/webhook.routes.ts for the payment event queue) — `onClose` hooks
 * were present so nothing leaked on shutdown, but neither filename suggests
 * "this is where a background poller starts," making it easy to lose track
 * of during a future route refactor. Starting and owning shutdown for both
 * here, called once from app.ts, makes this the one obvious place to look.
 *
 * Returns the payment event queue so webhook.routes.ts can enqueue directly
 * into this already-running instance instead of constructing a second one —
 * the queue isn't purely a background job, its `enqueue()` is also called
 * synchronously from the webhook HTTP handler's request path.
 */
export function registerBackgroundJobs(
  app: FastifyInstance,
  { database, services }: BackgroundJobsOptions,
): PaymentEventQueue {
  const paymentWorker = createPaymentWorker({
    database,
    emailService: services.email,
    logger: app.log,
  });

  const paymentEventQueue = new BackgroundPaymentEventQueue({
    database,
    paymentGateway: services.paymentGateway,
    logger: app.log,
    handler: async (event) => {
      await paymentWorker.processPaymentJob(event);
    },
  });
  paymentEventQueue.start();

  const fulfillmentScheduler = new CommerceFulfillmentScheduler({
    database,
    paymentGateway: services.paymentGateway,
    logger: app.log,
  });
  fulfillmentScheduler.start();

  app.addHook("onClose", async () => {
    paymentEventQueue.stop?.();
    fulfillmentScheduler.stop();
  });

  return paymentEventQueue;
}
