import type { FastifyInstance } from "fastify";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";
import type { AppServices } from "../index.ts";
import {
  BackgroundPaymentEventQueue,
  createPaymentWorker,
  type PaymentEventQueue,
} from "./durable-payment-queue.ts";
import { CommerceFulfillmentScheduler } from "./fulfillment-scheduler.ts";

export interface BackgroundJobsOptions {
  database: Kysely<Database>;
  services: AppServices;
}

/**
 * Registers all commerce background pollers and schedulers.
 */
export function registerBackgroundJobs(
  app: FastifyInstance,
  { database, services }: BackgroundJobsOptions,
): PaymentEventQueue {
  const paymentWorker = createPaymentWorker({
    database,
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
    await paymentEventQueue.stop();
    fulfillmentScheduler.stop();
  });

  return paymentEventQueue;
}
