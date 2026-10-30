import fs from "node:fs";
import { fileURLToPath } from "node:url";

import fastifyAutoload from "@fastify/autoload";
import fastifyCompress from "@fastify/compress";
import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import fastifyRateLimit from "@fastify/rate-limit";
import type { Database } from "@veolms/database";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";

import { createCorsMatcher } from "./cors.ts";
import { AppError, registerErrorHandler } from "./errors.ts";
import { registerOpenApi } from "./openapi.ts";
import {
  configureCaches,
  invalidateCache,
  startCacheBus,
  type CacheBus,
} from "./cache/index.ts";
import {
  cacheTagsForSiteContentChange,
  detectSiteContentChange,
} from "./site-content-changes.ts";
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

/**
 * The course a request changed, for the public course page rebuild. Learner
 * activity under `/courses/<uuid>/...` (discussions, notes, quizzes) and
 * routes that only name a course further along (access grants, a learner
 * leaving a course) are not changes to it; see `detectSiteContentChange`.
 */
function getCourseMutation(
  request: FastifyRequest,
): PendingCourseStaticRefresh | null {
  const change = detectSiteContentChange({
    method: request.method,
    url: request.url,
    routeUrl: request.routeOptions.url,
  });
  return change?.scope === "course" ? { courseId: change.courseId } : null;
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
    registerHooks,
    modulesDir,
    config,
    registerJobs,
    routePluginOptions,
    excludeModules = [],
    plugins = [],
  } = options;

  configureCaches({ enabled: config.CACHE_ENABLED });

  const app: FastifyInstance = Fastify({
    logger,
    trustProxy: config.TRUST_PROXY,
    routerOptions: { maxParamLength: MAX_PARAM_LENGTH },
  });

  // Before any route exists: an `onRoute` hook only sees the routes added
  // after it.
  registerHooks?.(app);

  const appServices =
    typeof rawServices === "function"
      ? (rawServices as (app: FastifyInstance) => TServices)(app)
      : (rawServices ??
        ({ email: { close: async () => {} } } as unknown as TServices));

  const pendingCourseRefreshes = new WeakMap<
    FastifyRequest,
    PendingCourseStaticRefresh
  >();

  // Caches of what the site shows are cleared before the response goes out,
  // so whoever made the change reads it back fresh.
  app.addHook("onSend", async (request, reply, payload) => {
    if (reply.statusCode < 200 || reply.statusCode >= 300) return payload;
    const change = detectSiteContentChange({
      method: request.method,
      url: request.url,
      routeUrl: request.routeOptions.url,
      userRoles: (request as { user?: { roles?: readonly string[] } }).user
        ?.roles,
    });
    if (change) invalidateCache(cacheTagsForSiteContentChange(change));
    return payload;
  });

  // Other processes are told about changes only while this one serves
  // requests: an app built for tests (`inject`) never listens, so it opens
  // no connection of its own.
  let cacheBus: CacheBus | null = null;
  if (config.CACHE_ENABLED && config.CACHE_BUS_ENABLED) {
    app.addHook("onListen", async () => {
      cacheBus ??= startCacheBus({
        connectionString: config.DATABASE_URL,
        database,
        logger: app.log,
      });
    });
    app.addHook("onClose", async () => {
      await cacheBus?.stop();
      cacheBus = null;
    });
  }

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
    const siteChange = detectSiteContentChange({
      method: request.method,
      url: request.url,
      routeUrl: request.routeOptions.url,
      userRoles: (request as { user?: { roles?: readonly string[] } }).user
        ?.roles,
    });
    if (siteChange?.scope === "site") {
      request.log.info(
        { siteContentChange: siteChange.reason },
        "Site-wide content changed",
      );
    }
    const pending = pendingCourseRefreshes.get(request);
    if (!pending || !appServices?.courseStaticPages) return;
    const status = appServices.courseStaticPages.requestRefresh(pending);
    request.log.info(
      { courseId: pending.courseId, refreshStatus: status.status },
      "Queued public course page refresh",
    );
  });

  // Baseline browser protections on every response. A header a route has set
  // for itself (the download routes do) is left as it is.
  const isProduction = config.NODE_ENV === "production";
  app.addHook("onSend", async (_request, reply, payload) => {
    // The declared content type is the one to use: a response is never
    // re-interpreted as a page or a script.
    if (!reply.hasHeader("x-content-type-options")) {
      reply.header("X-Content-Type-Options", "nosniff");
    }
    // API addresses can carry ids and short-lived tokens; they are not
    // passed on to other sites.
    if (!reply.hasHeader("referrer-policy")) {
      reply.header("Referrer-Policy", "no-referrer");
    }
    // Nothing the API serves (its documentation page, an invoice) uses
    // these device features.
    if (!reply.hasHeader("permissions-policy")) {
      reply.header(
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=()",
      );
    }
    // Most answers depend on who asks: a course overview lists unpublished
    // lessons to the course's admin and only published ones to a learner,
    // and lesson numbers are positions in that list. With no Cache-Control,
    // the CDN in front of the API (Cloudflare, for procodrr.dev) kept the
    // first answer it saw for up to two hours and gave it to everyone, so
    // learners got an admin's curriculum and every lesson after an
    // unpublished one played the next lesson's video. Routes that are the
    // same for everyone set their own header and keep it.
    if (!reply.hasHeader("cache-control")) {
      reply.header("Cache-Control", "private, no-store");
    }
    if (isProduction && !reply.hasHeader("strict-transport-security")) {
      reply.header("Strict-Transport-Security", "max-age=15552000");
    }
    return payload;
  });

  const responseDelayMs =
    config.NODE_ENV === "production" ? 0 : config.API_RESPONSE_DELAY_MS;
  if (responseDelayMs > 0) {
    app.log.warn(
      { responseDelayMs },
      "API_RESPONSE_DELAY_MS is set: every API call is delayed",
    );
    app.addHook("onRequest", async (request) => {
      // Preflight checks and the docs pages are not API calls.
      if (request.method === "OPTIONS" || request.url.startsWith("/docs")) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, responseDelayMs));
    });
  }

  // Await this: installs Zod compilers and the route-discovery hook that
  // everything registered below depends on.
  await registerOpenApi(app, config);
  registerErrorHandler(app);

  app.addHook("preSerialization", async (request, reply, payload) => {
    if (
      request.url.startsWith("/docs") ||
      request.routeOptions?.config?.rawResponse ||
      reply.getHeader("x-veolms-raw-response") === "true" ||
      Buffer.isBuffer(payload)
    ) {
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

  // Response compression (brotli/gzip negotiated from Accept-Encoding).
  // Responses were previously served uncompressed — e.g. the course
  // overview is ~57KB of JSON per request. mime-db gates compressibility,
  // so media/HLS byte streams are left alone, and SSE responses bypass
  // onSend entirely via reply.hijack(). Payloads under the threshold are
  // not worth the CPU.
  await app.register(fastifyCompress, {
    threshold: 1024,
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
    // Browsers may keep a preflight answer this long (Chrome caps it at two
    // hours). Without it every licence and progress POST was preceded by its
    // own OPTIONS request (55k of 485k API requests in 48 hours).
    maxAge: 7200,
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
    const excludeSet = new Set(excludeModules);

    // When excludeModules is provided, filter by the folder name that directly
    // contains each *.routes.ts file (e.g. "payments" for payments/payments.routes.ts).
    const routeMatchFilter: (path: string) => boolean =
      excludeSet.size === 0
        ? (path) => path.endsWith(".routes.ts")
        : (path) => {
            if (!path.endsWith(".routes.ts")) return false;
            const moduleFolder =
              path.replaceAll("\\", "/").split("/").at(-2) ?? "";
            return !excludeSet.has(moduleFolder);
          };

    await app.register(fastifyAutoload, {
      dir: resolvedModulesDir,
      matchFilter: routeMatchFilter,
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

  // The analytics event bus is also reachable from the app, so a plugin
  // can listen without knowing the services container's shape.
  const analyticsEvents = (appServices as { analyticsEvents?: unknown })
    ?.analyticsEvents;
  if (analyticsEvents && !app.hasDecorator("analyticsEvents")) {
    app.decorate("analyticsEvents", analyticsEvents);
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
