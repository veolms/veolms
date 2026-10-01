import fs from "node:fs";
import { fileURLToPath } from "node:url";

import fastifyAutoload from "@fastify/autoload";
import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import fastifyRateLimit from "@fastify/rate-limit";
import type { Database } from "@veolms/database";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";

import { createCorsMatcher } from "./cors.ts";
import { AppError, registerErrorHandler } from "./errors.ts";
import { registerOpenApi } from "./openapi.ts";
import type {
  CoreAppServices,
  CreateVeoLMSApiOptions,
  PendingCourseStaticRefresh,
} from "./types.ts";

export const API_ROUTE_PREFIX = "/v1";

/**
 * Must stay above the longest path parameter any contract accepts (currently
 * `courseSlugSchema`, at 160). Fastify's default of 100 rejects longer values
 * in the router with a 414 that no route can document.
 */
const MAX_PARAM_LENGTH = 512;

function getCourseMutation(
  request: FastifyRequest,
): PendingCourseStaticRefresh | null {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return null;
  if (request.routeOptions.url?.includes("static-page-refresh")) return null;
  const courseId = request.url.match(
    /\/(?:bin\/)?courses\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?:\/|\?|$)/iu,
  )?.[1];
  return courseId ? { courseId } : null;
}

function getCourseSlugFromResponse(payload: unknown): string | undefined {
  if (typeof payload !== "string" && !Buffer.isBuffer(payload))
    return undefined;
  try {
    const serialized = Buffer.isBuffer(payload)
      ? payload.toString("utf8")
      : payload;
    const parsed: unknown = JSON.parse(serialized);
    const envelope =
      parsed && typeof parsed === "object" && "data" in parsed
        ? parsed.data
        : parsed;
    if (!envelope || typeof envelope !== "object") return undefined;
    if (
      "course" in envelope &&
      envelope.course &&
      typeof envelope.course === "object" &&
      "slug" in envelope.course &&
      typeof envelope.course.slug === "string"
    )
      return envelope.course.slug;
    return "slug" in envelope && typeof envelope.slug === "string"
      ? envelope.slug
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Core Fastify application factory.
 *
 * Assembles a fully-configured Fastify instance: middleware, OpenAPI, rate
 * limiting, CORS, cookie support, autoloaded route plugins, background jobs,
 * and any caller-supplied ApiPlugins (for cloud extensions).
 *
 * The calling app (`apps/api/src/app.ts`) owns its own `modules/` directory,
 * services, and background job registration — it passes all of these in via
 * options so api-core has no hard dependency on app-internal paths.
 *
 * Generic over `TDatabase` (default: `Database`) so cloud apps can supply a
 * `Kysely<CloudDatabase>` where `CloudDatabase extends Database`, giving their
 * ApiPlugins full type access to cloud-only tables without widening to `unknown`.
 */
export async function createVeoLMSApi<
  TServices extends CoreAppServices,
  TDatabase extends Database = Database,
  TPaymentEventQueue = unknown,
>(
  options: CreateVeoLMSApiOptions<TServices, TDatabase, TPaymentEventQueue>,
): Promise<FastifyInstance> {
  const {
    database,
    logger = true,
    services: rawServices,
    modulesDir,
    config,
    registerJobs,
    routePluginOptions,
    plugins = [],
  } = options;

  const app: FastifyInstance = Fastify({
    logger,
    trustProxy: config.TRUST_PROXY,
    routerOptions: { maxParamLength: MAX_PARAM_LENGTH },
  });

  const appServices =
    typeof rawServices === "function"
      ? (rawServices as (app: FastifyInstance) => TServices)(app)
      : (rawServices ??
        ({ email: { close: async () => {} } } as unknown as TServices));

  const pendingCourseRefreshes = new WeakMap<
    FastifyRequest,
    PendingCourseStaticRefresh
  >();

  app.addHook("onSend", async (request, _reply, payload) => {
    const pending = getCourseMutation(request);
    if (pending) {
      const courseSlug = getCourseSlugFromResponse(payload);
      pendingCourseRefreshes.set(request, {
        ...pending,
        ...(courseSlug ? { courseSlug } : {}),
      });
    }
    return payload;
  });

  app.addHook("onResponse", async (request, reply) => {
    if (reply.statusCode < 200 || reply.statusCode >= 300) return;
    const pending = pendingCourseRefreshes.get(request);
    if (!pending || !appServices?.courseStaticPages) return;
    const status = appServices.courseStaticPages.requestRefresh(pending);
    request.log.info(
      { courseId: pending.courseId, refreshStatus: status.status },
      "Queued public course page refresh",
    );
  });

  // Await this: installs Zod compilers and the route-discovery hook that
  // everything registered below depends on.
  await registerOpenApi(app, config);
  registerErrorHandler(app);

  app.addHook("preSerialization", async (request, reply, payload) => {
    if (request.url.startsWith("/docs")) {
      return payload;
    }

    if (payload instanceof AppError) {
      return payload.toJSON();
    }

    if (
      payload &&
      typeof payload === "object" &&
      "success" in payload &&
      "statusCode" in payload
    ) {
      return payload;
    }

    return {
      success: true,
      statusCode: reply.statusCode,
      data: payload,
    };
  });

  await app.register(fastifyCookie, {
    secret: config.SESSION_SECRET,
  });

  await app.register(fastifyRateLimit, {
    global: false,
    errorResponseBuilder: (_request, context) =>
      new AppError(
        429,
        "RATE_LIMIT_EXCEEDED",
        `Too many requests. Please try again in ${context.after}.`,
      ),
  });

  const corsMatcher = createCorsMatcher(config);

  await app.register(fastifyCors, {
    origin: (origin, callback) =>
      callback(null, corsMatcher.isAllowedOrigin(origin)),
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });

  // Bootstrap background jobs and get the payment event queue reference.
  const paymentEventQueue = registerJobs
    ? registerJobs(app, {
        database,
        services: appServices,
      })
    : undefined;

  // Auto-load every *.routes.ts file from the caller's modules directory (or default core modules).
  const resolvedModulesDir =
    modulesDir ??
    fileURLToPath(new URL("../../../apps/api/src/modules", import.meta.url));

  if (fs.existsSync(resolvedModulesDir)) {
    await app.register(fastifyAutoload, {
      dir: resolvedModulesDir,
      matchFilter: /\.routes\.ts$/,
      // Disable index-file special-casing so barrel index.ts files next to
      // *.routes.ts files don't silently suppress route registration.
      indexPattern: /^$/,
      dirNameRoutePrefix: false,
      ignorePattern: /(?:^|[\\/])_/u,
      options: routePluginOptions
        ? routePluginOptions(
            paymentEventQueue as TPaymentEventQueue,
            appServices,
          )
        : { prefix: "/v1", database, services: appServices },
    });
  }

  // Release pooled SMTP connections when the server shuts down.
  if (appServices?.email?.close) {
    app.addHook("onClose", async () => {
      await appServices.email.close();
    });
  }

  // Register cloud plugins after all core setup is complete.
  for (const plugin of plugins) {
    await plugin.register(app, {
      database,
      services: appServices,
    });
  }

  return app;
}
