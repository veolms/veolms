import type { ServerConfig } from "@veolms/config";
import type { ErrorResponse, ValidationIssue } from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { FastifyInstance, FastifyServerOptions } from "fastify";
import type { Kysely } from "kysely";
import type { ApiPlugin } from "@veolms/plugin-sdk";

export type { ApiPlugin, WebExtension } from "@veolms/plugin-sdk";
export type { ErrorResponse, ValidationIssue };

/**
 * Minimal structural type for AppServices that api-core references.
 * The full concrete type lives in apps/api/src/services/index.ts.
 * Cloud apps that need concrete types should import @veolms/api directly
 * or depend on @veolms/api-core's AppServices export.
 */
export interface CoreAppServices {
  email: { close(): Promise<void> };
  courseStaticPages?: {
    requestRefresh(opts: { courseId: string; courseSlug?: string }): {
      status: string;
    };
  };
}

export interface PendingCourseStaticRefresh {
  courseId: string;
  courseSlug?: string;
}

export interface CreateVeoLMSApiOptions<
  TServices extends CoreAppServices = CoreAppServices,
  TDatabase extends Database = Database,
  TPaymentEventQueue = unknown,
> {
  /** Kysely database instance. Generic so cloud can pass Kysely<CloudDatabase extends Database>. */
  database: Kysely<TDatabase>;
  /** Pino/Fastify logger config (defaults to `true`). */
  logger?: FastifyServerOptions["logger"];
  /**
   * Pre-built services or a factory function receiving the created FastifyInstance.
   */
  services?: TServices | ((app: FastifyInstance) => TServices);
  /**
   * Absolute path to the `modules/` directory containing route plugins.
   * Pass `fileURLToPath(new URL("./modules", import.meta.url))` from the
   * calling app's `app.ts`. Optional if the app only registers plugins.
   */
  modulesDir?: string;
  /**
   * Parsed server config. Passed down to OpenAPI registration and CORS logic.
   */
  config: ServerConfig;
  /**
   * Registers the background jobs (payment queue, fulfillment scheduler, etc.)
   * and returns the payment event queue so it can be passed to routes via
   * autoload options. This is a callback so api-core doesn't need to import
   * the concrete job implementations.
   */
  registerJobs?: (
    app: FastifyInstance,
    opts: { database: Kysely<TDatabase>; services: TServices },
  ) => TPaymentEventQueue;
  /**
   * Options object merged into `@fastify/autoload`'s `options` — these are
   * handed to every route plugin. Must include at minimum the fields declared
   * by `RoutePluginOptions` in `apps/api`.
   */
  routePluginOptions?: (
    paymentEventQueue: TPaymentEventQueue,
    services: TServices,
  ) => Record<string, unknown>;
  /** Cloud-only ApiPlugins to register after all core setup. */
  plugins?: ApiPlugin<TDatabase>[];
}
