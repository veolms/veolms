import { fileURLToPath } from "node:url";
import { isIP } from "node:net";

import fastifyAutoload from "@fastify/autoload";
import type { Database } from "@veolms/database";
import Fastify, {
  type FastifyInstance,
  type FastifyRequest,
  type FastifyServerOptions,
} from "fastify";
import type { Kysely } from "kysely";
import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import fastifyRateLimit from "@fastify/rate-limit";

import { registerErrorHandler } from "./middlewares/error.middleware.ts";
import { AppError } from "./lib/errors.ts";
import type { RoutePluginOptions } from "./lib/route-plugin.ts";
import { registerOpenApi } from "./openapi.ts";
import { createServices, type AppServices } from "./services/index.ts";
import { config } from "./config.ts";
import { registerBackgroundJobs } from "./background-jobs.ts";

export const API_ROUTE_PREFIX = "/v1";

interface PendingCourseStaticRefresh {
  courseId: string;
  courseSlug?: string;
}

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
    trustProxy: config.TRUST_PROXY,
    routerOptions: { maxParamLength: MAX_PARAM_LENGTH },
  });

  const appServices = services ?? createServices({ config, logger: app.log });
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
    if (!pending || !appServices.courseStaticPages) return;
    const status = appServices.courseStaticPages.requestRefresh(pending);
    request.log.info(
      { courseId: pending.courseId, refreshStatus: status.status },
      "Queued public course page refresh",
    );
  });

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
    if (request.url.startsWith("/docs")) {
      return payload;
    }

    // AppError carries transport metadata (statusCode, code, and the original
    // Error fields) so the error handler can classify it. Those implementation
    // fields are not part of the public ErrorResponse contract, though, and a
    // strict Zod response serializer rejects them when an error is sent
    // directly from a pre-handler. Convert it at the serialization boundary.
    if (payload instanceof AppError) {
      return payload.toJSON();
    }

    // Already-enveloped payloads (notably error responses) pass through
    // untouched, so they are not wrapped a second time.
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

  // Register cookie support for stateful sessions
  await app.register(fastifyCookie, {
    secret: config.SESSION_SECRET,
  });

  // Registered globally but inert (`global: false`) except on routes that
  // opt in via `config: { rateLimit: {...} }` — see otp.routes.ts. Keyed by
  // `request.ip`, which respects `trustProxy` above, so it caps abuse per
  // source IP regardless of how many identifiers (emails/phones) it rotates
  // through — the per-identifier limit in otp.service.ts alone doesn't.
  await app.register(fastifyRateLimit, {
    global: false,
    // The plugin `throw`s whatever this returns, so it must be an Error —
    // returning a plain object skips the `AppError` branch in
    // registerErrorHandler and renders as a generic 500 instead of a 429.
    errorResponseBuilder: (_request, context) =>
      new AppError(
        429,
        "RATE_LIMIT_EXCEEDED",
        `Too many requests. Please try again in ${context.after}.`,
      ),
  });

  // CORS_ORIGINS entries may use a leading `*.` host wildcard (for example
  // `https://*.dev-preview.veolms.org`) to allow every subdomain of that host
  // with the same scheme and port. The bare parent host is not matched.
  const corsWildcardOrigins = config.CORS_ORIGINS.flatMap((entry) => {
    const match = /^(https?):\/\/\*\.([^/:]+)(?::(\d+))?$/iu.exec(entry);
    if (!match?.[1] || !match[2]) return [];
    return [
      {
        protocol: `${match[1].toLowerCase()}:`,
        hostSuffix: `.${match[2].toLowerCase()}`,
        port: match[3] ?? "",
      },
    ];
  });

  const matchesCorsWildcard = (origin: string): boolean => {
    if (corsWildcardOrigins.length === 0) return false;
    try {
      const url = new URL(origin);
      return corsWildcardOrigins.some(
        (pattern) =>
          url.protocol === pattern.protocol &&
          url.port === pattern.port &&
          url.hostname.endsWith(pattern.hostSuffix),
      );
    } catch {
      return false;
    }
  };

  const isAllowedLanOrigin = (origin: string | undefined): boolean => {
    if (
      !origin ||
      config.CORS_ORIGINS.includes(origin) ||
      config.WEBAUTHN_ORIGINS.includes(origin) ||
      matchesCorsWildcard(origin)
    ) {
      return true;
    }
    if (config.NODE_ENV === "production") return false;

    try {
      const url = new URL(origin);
      if (url.protocol !== "http:" || isIP(url.hostname) !== 4) return false;

      const octets = url.hostname.split(".").map(Number);
      if (
        octets.some(
          (octet) => !Number.isInteger(octet) || octet < 0 || octet > 255,
        )
      ) {
        return false;
      }

      const firstOctet = octets[0] ?? -1;
      const secondOctet = octets[1] ?? -1;
      return (
        firstOctet === 10 ||
        (firstOctet === 172 && secondOctet >= 16 && secondOctet <= 31) ||
        (firstOctet === 192 && secondOctet === 168)
      );
    } catch {
      return false;
    }
  };

  // Configure CORS. Private LAN origins are allowed for device-based local
  // development so credentialed requests work from any local IPv4 address.
  await app.register(fastifyCors, {
    origin: (origin, callback) => callback(null, isAllowedLanOrigin(origin)),
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
    // @fastify/autoload's default indexPattern (index.ts/js/...) treats an
    // index file as THE plugin for its directory and silently skips every
    // sibling file — including that directory's *.routes.ts. Several modules
    // (media, access, discussion-uploads) have a barrel index.ts re-exporting
    // their service for other modules to import, which was silently deleting
    // their routes from the app with no error at boot. Setting this to a
    // pattern no real filename matches disables that special-casing so
    // matchFilter alone decides what gets registered, letting a barrel
    // index.ts sit next to a routes.ts without suppressing it.
    indexPattern: /^$/,
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
