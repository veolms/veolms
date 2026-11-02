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

/** Adds core's app-wide hooks to `app`. Fits `registerHooks`. */
export type CoreAppHooks = (app: FastifyInstance) => void;

interface CoreAppHooksModule {
  registerAppHooks: CoreAppHooks;
}

/**
 * Loads the hooks core's routes rely on, for an app that composes
 * `createVeoLMSApi` itself, such as the cloud API:
 *
 *   createVeoLMSApi({ registerHooks: await loadCoreAppHooks(), ... })
 *
 * Without them, a signed-out caller is told what is wrong with a request
 * field by field instead of 401, and a student at the device limit is never
 * given the cookie the device list is read with, so the list always says
 * the sign-in has expired. Loaded from the core app by path, like the jobs.
 */
export async function loadCoreAppHooks(): Promise<CoreAppHooks> {
  const url = new URL("../../../apps/api/src/app-hooks.ts", import.meta.url);
  const module = (await import(url.href)) as CoreAppHooksModule;
  return module.registerAppHooks;
}
