import { fileURLToPath } from "node:url";

import fastifyAutoload from "@fastify/autoload";
import type { Database } from "@veolms/database";
import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
} from "fastify";
import type { Kysely } from "kysely";
import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";

import { registerErrorHandler } from "./middlewares/error.middleware.ts";
import type { RoutePluginOptions } from "./lib/route-plugin.ts";
import { registerOpenApi } from "./openapi.ts";
import { createServices, type AppServices } from "./services/index.ts";
import { config } from "./config.ts";
import { registerBackgroundJobs } from "./background-jobs.ts";

export const API_ROUTE_PREFIX = "/api/v1";

/**
 * Must stay above the longest path parameter any contract accepts (currently
 * `courseSlugSchema`, at 160). Fastify's default of 100 rejects longer values in
 * the router with a 414 that no route can document, which both hides valid slugs
 * and makes the documented 400 unreachable.
 */
const MAX_PARAM_LENGTH = 512;

interface CreateAppOptions {
  database: Kysely<Database>;
  logger?: FastifyServerOptions["logger"];
  /** Overridable so tests can supply stubs instead of real gateways. */
  services?: AppServices;
}

export async function createApp({
  database,
  logger = true,
  services,
}: CreateAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger,
    routerOptions: { maxParamLength: MAX_PARAM_LENGTH },
  });

  const appServices = services ?? createServices({ config, logger: app.log });

  // Await this: it installs the Zod compilers and the route-discovery hook that
  // everything registered below depends on.
  await registerOpenApi(app);
  registerErrorHandler(app);

  // Note: raw-body buffering for HMAC signature verification (Razorpay
  // webhooks) used to be registered here app-wide, so every request in the
  // entire API held both the raw buffer and the parsed JSON in memory. It's
  // now scoped to just the /webhooks/razorpay plugin — see
  // modules/commerce/webhooks/webhook.routes.ts — relying on Fastify's
  // per-plugin encapsulation (content type parsers registered inside a
  // registered plugin only apply to that plugin's own routes, not siblings).

  app.addHook("preSerialization", async (request, reply, payload) => {
    if (request.url.startsWith("/api/docs")) {
      return payload;
    }

    // Already-enveloped payloads (notably error responses) pass through
    // untouched, so they are not wrapped a second time.
    if (payload && typeof payload === "object" && "success" in payload) {
      return payload;
    }

    return {
      success: true,
      statusCode: reply.statusCode,
      data: payload,
    };
  });

  // Register cookie support for stateful sessions
  await app.register(fastifyCookie, {
    secret: config.SESSION_SECRET,
  });

  // Configure CORS
  await app.register(fastifyCors, {
    origin:
      config.NODE_ENV === "production"
        ? config.WEB_URL
        : "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });

  // Centralized bootstrap for every commerce background poller (fulfillment
  // scheduler, payment event queue) — see background-jobs.ts for why this
  // isn't started inside a route plugin file instead.
  const paymentEventQueue = registerBackgroundJobs(app, {
    database,
    services: appServices,
  });

  // Every module in src/modules is scanned, and only files ending in .routes.ts
  // are loaded as Fastify plugins.
  await app.register(fastifyAutoload, {
    dir: fileURLToPath(new URL("./modules", import.meta.url)),
    matchFilter: /\.routes\.ts$/,
    dirNameRoutePrefix: false,
    ignorePattern: /(?:^|[\\/])_/u,
    options: {
      prefix: API_ROUTE_PREFIX,
      database,
      services: appServices,
      paymentEventQueue,
    } satisfies RoutePluginOptions,
  });

  // Release pooled SMTP connections when the server shuts down.
  app.addHook("onClose", async () => {
    await appServices.email.close();
  });

  return app;
}
