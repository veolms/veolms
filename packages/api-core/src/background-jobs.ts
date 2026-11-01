import type { Database } from "@veolms/database";
import type { FastifyInstance } from "fastify";
import type { Kysely } from "kysely";

import type { CoreAppServices } from "./types.ts";

/**
 * Starts core's background jobs on `app` and returns the payment event queue
 * that the webhook routes enqueue into. Fits `createVeoLMSApi`'s
 * `registerJobs` option.
 */
export type CoreBackgroundJobs = <
  TDatabase extends Database,
  TServices extends CoreAppServices,
>(
  app: FastifyInstance,
  opts: { database: Kysely<TDatabase>; services: TServices },
) => unknown;

interface CoreBackgroundJobsModule {
  registerBackgroundJobs: CoreBackgroundJobs;
}

/**
 * Loads core's background jobs for an app that composes `createVeoLMSApi`
 * itself, such as the cloud API:
 *
 *   createVeoLMSApi({ registerJobs: await loadCoreBackgroundJobs(), ... })
 *
 * They are the payment webhook queue, order reconciliation, learning
 * reminders, the notification outbox and email worker, the ops heartbeat and
 * the discussion upload purge. An app that leaves `registerJobs` out has none
 * of them: the webhook handler has no queue to enqueue into and no
 * notification is ever delivered.
 *
 * The module is loaded from the core app by path, like the factory's default
 * `modulesDir`, so api-core keeps no static dependency on app code. The
 * services passed in must be the full core app services, not just
 * `CoreAppServices`.
 */
export async function loadCoreBackgroundJobs(): Promise<CoreBackgroundJobs> {
  const url = new URL(
    "../../../apps/api/src/background-jobs.ts",
    import.meta.url,
  );
  const module = (await import(url.href)) as CoreBackgroundJobsModule;
  return module.registerBackgroundJobs;
}
