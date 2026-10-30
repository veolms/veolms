import type { Database } from "@veolms/database";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { Kysely } from "kysely";

import type { AppServices } from "../services/index.ts";
import type { PaymentEventQueue } from "../modules/commerce/webhooks/payment-event.queue.ts";

/** Options `@fastify/autoload` hands to every module in `src/routes`. */
export type RoutePluginOptions = {
  prefix: string;
  database: Kysely<Database>;
  services: AppServices;
  /**
   * The already-running payment event queue, started once in
   * background-jobs.ts. webhooks/webhook.routes.ts enqueues into this
   * instead of constructing its own — see registerBackgroundJobs' doc
   * comment for why background job bootstrap lives outside route files.
   */
  paymentEventQueue: PaymentEventQueue;
};

/**
 * The signature every module in `src/routes` must default-export.
 *
 * Using this type gives the module Zod-inferred `request`/`reply` types and, via
 * `@fastify/swagger`'s route discovery, an OpenAPI entry for free — declaring
 * the route is the only step.
 */
export type RoutePlugin = FastifyPluginAsyncZod<RoutePluginOptions>;
