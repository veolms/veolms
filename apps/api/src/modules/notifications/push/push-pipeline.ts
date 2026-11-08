import type { ServerConfig } from "@veolms/config";
import type { Database } from "@veolms/database";
import type { FastifyBaseLogger } from "fastify";
import type { Kysely } from "kysely";

import { createFcmClient, type FcmClient } from "./fcm.client.ts";
import { pushAppsFor } from "./push-apps.ts";
import {
  createPushSender,
  type PushSender,
  type RevokedSessionLookup,
} from "./push-sender.ts";

/**
 * The push sender for this process, or null while push is off
 * (PUSH_ENABLED=false) or no app is set up (PUSH_APPS). Problems reading
 * PUSH_APPS or a key file are logged here, once, at start.
 */
export function createPushPipeline({
  database,
  logger,
  config,
  sessions,
  fcm,
}: {
  database: Kysely<Database>;
  logger: FastifyBaseLogger;
  config: Pick<
    ServerConfig,
    | "PUSH_ENABLED"
    | "PUSH_APPS"
    | "PUSH_TARGET_FIELD"
    | "PUSH_FCM_ENDPOINT"
    | "PUSH_MAX_ATTEMPTS"
    | "PUSH_SEND_CONCURRENCY"
    | "NOTIFICATION_BATCH_SIZE"
    | "NOTIFICATION_LEASE_SECONDS"
    | "NOTIFICATION_RETRY_SECONDS"
  >;
  sessions?: RevokedSessionLookup;
  /** A stand-in for Firebase (tests). */
  fcm?: FcmClient;
}): PushSender | null {
  if (!config.PUSH_ENABLED) return null;
  const apps = pushAppsFor(config.PUSH_APPS);
  if (apps.problem) logger.error({ job: "push-sender" }, apps.problem);
  for (const app of apps.list()) {
    if (app.problem) logger.error({ job: "push-sender" }, app.problem);
  }
  if (!apps.configured) return null;
  logger.info(
    {
      job: "push-sender",
      apps: apps.list().map((app) => ({
        applicationId: app.applicationId,
        ready: app.serviceAccount !== null,
      })),
    },
    "Push sending is on",
  );
  return createPushSender({
    database,
    apps,
    fcm: fcm ?? createFcmClient({ endpoint: config.PUSH_FCM_ENDPOINT }),
    logger,
    sessions,
    config: {
      batchSize: config.NOTIFICATION_BATCH_SIZE,
      leaseSeconds: config.NOTIFICATION_LEASE_SECONDS,
      maxAttempts: config.PUSH_MAX_ATTEMPTS,
      concurrency: config.PUSH_SEND_CONCURRENCY,
      targetField: config.PUSH_TARGET_FIELD,
      retryScheduleSeconds: config.NOTIFICATION_RETRY_SECONDS,
    },
  });
}
