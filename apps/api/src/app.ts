import { fileURLToPath } from "node:url";

import type { Database } from "@veolms/database";
import type { FastifyInstance, FastifyServerOptions } from "fastify";
import type { Kysely } from "kysely";

import { createVeoLMSApi } from "@veolms/api-core";
import type { ApiPlugin } from "@veolms/api-core";

import { config } from "./config.ts";
import { registerBackgroundJobs } from "./background-jobs.ts";
import { createServices, type AppServices } from "./services/index.ts";
import type { RoutePluginOptions } from "./lib/route-plugin.ts";

// Re-export so the rest of the codebase continues to import from this module.
export { AppError, httpError, registerErrorHandler } from "@veolms/api-core";
export type { CoreAppServices } from "@veolms/api-core";

export { API_ROUTE_PREFIX } from "@veolms/api-core";

interface CreateAppOptions {
  database: Kysely<Database>;
  logger?: FastifyServerOptions["logger"];
  /** Overridable so tests can supply stubs instead of real gateways. */
  services?: AppServices;
  /** Cloud-only plugins (passed from cloud's thin app). */
  plugins?: ApiPlugin<Database>[];
}

/**
 * Assembles the VeoLMS Fastify application.
 *
 * Delegates all wiring to `@veolms/api-core`'s `createVeoLMSApi`, passing
 * the app-local `modules/` directory, background job registration, and
 * route plugin options. Any cloud `plugins` are forwarded to the factory and
 * registered after core setup.
 */
export async function createApp({
  database,
  logger = true,
  services,
  plugins,
}: CreateAppOptions): Promise<FastifyInstance> {
  return createVeoLMSApi({
    database,
    logger,
    services: (app) => services ?? createServices({ config, logger: app.log }),
    config,
    modulesDir: fileURLToPath(new URL("./modules", import.meta.url)),
    registerJobs: (app, opts) =>
      registerBackgroundJobs(app, {
        database: opts.database,
        services: opts.services,
      }),
    routePluginOptions: (paymentEventQueue, appServices) =>
      ({
        prefix: "/v1",
        database,
        services: appServices,
        paymentEventQueue,
      }) satisfies RoutePluginOptions,
    plugins,
  });
}
