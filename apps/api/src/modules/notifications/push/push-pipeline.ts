import type { ServerConfig } from "@veolms/config";
import type { Database } from "@veolms/database";
import type { FastifyBaseLogger } from "fastify";
import type { Kysely } from "kysely";

import { createFcmClient, type FcmClient } from "./fcm.client.ts";
import { pushAppsFor } from "./push-apps.ts";
import { webPushSetup, type WebPushConfig } from "./web-push.setup.ts";
import { createWebPushClient, type WebPushClient } from "./web-push.client.ts";
import {
  createPushSender,
  type PushSender,
  type RevokedSessionLookup,
} from "./push-sender.ts";

/**
 * Whether this server sends pushes at all (PUSH_ENABLED, and at least one
 * app in PUSH_APPS or web push with its keys). Producers that queue work
 * only for push (chat messages) check this first, so nothing is queued
 * while push is off.
 */
export function isPushConfigured(
  config: Pick<ServerConfig, "PUSH_ENABLED" | "PUSH_APPS"> & WebPushConfig,
): boolean {
  return (
    config.PUSH_ENABLED &&
    (pushAppsFor(config.PUSH_APPS).configured ||
      webPushSetup(config).vapid !== null)
  );
}

/**
 * The push sender for this process, or null while push is off
 * (PUSH_ENABLED=false) or nothing is set up (no PUSH_APPS, no web push
 * keys). Problems reading PUSH_APPS, a key file or the VAPID keys are
 * logged here, once, at start.
 */
export function createPushPipeline({
  database,
  logger,
  config,
  sessions,
  fcm,
  web,
}: {
  database: Kysely<Database>;
  logger: FastifyBaseLogger;
  config: WebPushConfig &
    Pick<
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
  /** A stand-in for the browsers' push services (tests). */
  web?: WebPushClient;
}): PushSender | null {
  if (!config.PUSH_ENABLED) return null;
  const apps = pushAppsFor(config.PUSH_APPS);
  if (apps.problem) logger.error({ job: "push-sender" }, apps.problem);
  for (const app of apps.list()) {
    if (app.problem) logger.error({ job: "push-sender" }, app.problem);
  }
  const webSetup = webPushSetup(config);
  if (webSetup.problem) logger.error({ job: "push-sender" }, webSetup.problem);
  if (!apps.configured && !webSetup.vapid) return null;
  logger.info(
    {
      job: "push-sender",
      apps: apps.list().map((app) => ({
        applicationId: app.applicationId,
        ready: app.serviceAccount !== null,
      })),
      web: webSetup.vapid !== null,
    },
    "Push sending is on",
  );
  return createPushSender({
    database,
    apps,
    fcm: fcm ?? createFcmClient({ endpoint: config.PUSH_FCM_ENDPOINT }),
    web: webSetup.vapid
      ? (web ?? createWebPushClient({ vapid: webSetup.vapid }))
      : null,
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
