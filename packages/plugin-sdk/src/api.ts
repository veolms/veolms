import type { FastifyInstance } from "fastify";
import type { Kysely } from "kysely";

/**
 * Plugin that extends the VeoLMS API.
 * Generic over TDatabase so cloud apps can pass Kysely<CloudDatabase>
 * while core's own database type is used by default.
 *
 * Registered via createVeoLMSApi({ plugins }).
 */
export interface ApiPlugin<TDatabase = unknown> {
  name: string;
  /**
   * Called with the fully-configured Fastify app after all core setup
   * (middleware, autoloaded routes, background jobs) has completed.
   */
  register(
    app: FastifyInstance,
    options: ApiPluginOptions<TDatabase>,
  ): Promise<void>;
}

export interface ApiPluginOptions<TDatabase = unknown> {
  /**
   * Kysely database instance — same one used by all core routes.
   * Generic so cloud can pass Kysely<CloudDatabase extends Database>.
   */
  database: Kysely<TDatabase>;
  /**
   * Core services (email, storage, payment, etc.).
   * Typed as `unknown` here; cloud apps import `@veolms/api-core` to
   * get the concrete `AppServices` type.
   */
  services: unknown;
}
