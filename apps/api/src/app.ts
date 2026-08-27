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

  const appServices =
    services ?? createServices({ config, logger: app.log });

  // Await this: it installs the Zod compilers and the route-discovery hook that
  // everything registered below depends on.
  await registerOpenApi(app);
  registerErrorHandler(app);

  // Retain raw byte buffer on request for HMAC signature verification (e.g., Razorpay webhooks)
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
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
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
    } satisfies RoutePluginOptions,
  });

  // Release pooled SMTP connections when the server shuts down.
  app.addHook("onClose", async () => {
    await appServices.email.close();
  });

  return app;
}
