import type { FastifyInstance } from "fastify";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";
import { config } from "./config.ts";
import type { AppServices } from "./services/index.ts";
import { createAuthService } from "./modules/auth/index.ts";
import { createEnrollmentAudienceService } from "./modules/commerce/index.ts";
import { createPaymentWorker } from "./modules/commerce/fulfillment/payment.worker.ts";
import {
  BackgroundPaymentEventQueue,
  type PaymentEventQueue,
} from "./modules/commerce/webhooks/payment-event.queue.ts";
import { CommerceFulfillmentScheduler } from "./modules/commerce/fulfillment/fulfillment.scheduler.ts";
import { LearningReminderWorker } from "./modules/learning-progress/learning-reminder.worker.ts";
import { createNotificationProcessor } from "./modules/notifications/index.ts";
import { getDatabasePoolMetrics } from "@veolms/database";
import * as webhookRepo from "./modules/commerce/webhooks/webhook.repository.ts";
import * as outboxRepo from "./events/outbox.repository.ts";
import * as notificationRepo from "./modules/notifications/notifications.repository.ts";

export interface BackgroundJobsOptions {
  database: Kysely<Database>;
  services: AppServices;
}

/**
 * Centralized bootstrap for every commerce background poller.
 *
 * Both of these used to be started as a side effect of registering an
 * unrelated route plugin (payment.routes.ts for the fulfillment scheduler,
 * webhooks/webhook.routes.ts for the payment event queue) — `onClose` hooks
 * were present so nothing leaked on shutdown, but neither filename suggests
 * "this is where a background poller starts," making it easy to lose track
 * of during a future route refactor. Starting and owning shutdown for both
 * here, called once from app.ts, makes this the one obvious place to look.
 *
 * Returns the payment event queue so webhook.routes.ts can enqueue directly
 * into this already-running instance instead of constructing a second one —
 * the queue isn't purely a background job, its `enqueue()` is also called
 * synchronously from the webhook HTTP handler's request path.
 */
export function registerBackgroundJobs(
  app: FastifyInstance,
  { database, services }: BackgroundJobsOptions,
): PaymentEventQueue {
  const paymentWorker = createPaymentWorker({
    database,
    logger: app.log,
  });

  const paymentEventQueue = new BackgroundPaymentEventQueue({
    database,
    paymentGateway: services.paymentGateway,
    logger: app.log,
    handler: async (event) => {
      await paymentWorker.processPaymentJob(event);
    },
  });
  paymentEventQueue.start();

  const fulfillmentScheduler = new CommerceFulfillmentScheduler({
    database,
    paymentGateway: services.paymentGateway,
    logger: app.log,
  });
  fulfillmentScheduler.start();

  const learningReminderWorker = new LearningReminderWorker({
    database,
    logger: app.log,
  });
  learningReminderWorker.start();

  const stopNotificationLoop = config.NOTIFICATION_INLINE_WORKER
    ? startInlineNotificationLoop(app, database, services)
    : null;

  const stopHeartbeat =
    config.OPS_HEARTBEAT_SECONDS > 0 ? startOpsHeartbeat(app, database) : null;

  app.addHook("onClose", async () => {
    await paymentEventQueue.stop?.();
    // Awaited so an in-flight reconciliation cycle finishes before the
    // shared Kysely instance is destroyed right after these hooks.
    await fulfillmentScheduler.stop();
    await learningReminderWorker.stop();
    await stopNotificationLoop?.();
    stopHeartbeat?.();
  });

  return paymentEventQueue;
}

/**
 * Periodic one-line ops gauge: pool saturation and queue depths.
 *
 * The audit's biggest production unknowns were exactly these numbers —
 * pool starvation queued requests invisibly, and a growing webhook or
 * outbox backlog had no signal anywhere. One structured log line per
 * interval makes them greppable/alertable without adding a metrics stack.
 */
function startOpsHeartbeat(
  app: FastifyInstance,
  database: Kysely<Database>,
): () => void {
  const intervalMs = config.OPS_HEARTBEAT_SECONDS * 1000;
  let running = false;

  const beat = async () => {
    if (running) return;
    running = true;
    try {
      const [webhookQueue, outbox, emailBacklog] = await Promise.all([
        webhookRepo.getWebhookQueueDepth(database),
        outboxRepo.getOutboxDepth(database),
        notificationRepo.getEmailDeliveryBacklog(database),
      ]);
      app.log.info(
        {
          job: "ops-heartbeat",
          pools: getDatabasePoolMetrics(),
          webhookQueue,
          outbox,
          emailBacklog,
        },
        "Ops heartbeat",
      );
    } catch (error) {
      app.log.warn(
        { err: error, job: "ops-heartbeat" },
        "Ops heartbeat failed",
      );
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void beat(), intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

/**
 * Runs the notification outbox/email processor inside the API process.
 *
 * The processor also exists as a standalone script (`notifications:process`
 * / `notifications:watch`), but nothing in the repository or the deploy
 * pipeline schedules it — so unless ops remembered to run it by hand, no
 * in-app notifications or emails were ever produced from the outbox. This
 * inline loop makes notification delivery work by default.
 *
 * Running it in every replica — or alongside a dedicated worker process —
 * is safe: outbox events and email deliveries are claimed with
 * FOR UPDATE SKIP LOCKED plus a lease, attempts count at claim time, and
 * every mark is fenced on the claim's lease. Deployments that prefer the
 * dedicated worker can set NOTIFICATION_INLINE_WORKER=false.
 *
 * Returns an async stop function that waits for an in-flight cycle, so
 * shutdown cannot hit the destroyed Kysely pool mid-batch.
 */
function startInlineNotificationLoop(
  app: FastifyInstance,
  database: Kysely<Database>,
  services: AppServices,
): () => Promise<void> {
  const auth = createAuthService({ database });
  const audience = createEnrollmentAudienceService({ database });
  const processor = createNotificationProcessor({
    database,
    email: services.email,
    logger: app.log,
    config,
    handlers: {
      listActiveCourseRecipientUserIds: (courseId) =>
        audience.listActiveUserIdsForCourse(courseId),
    },
    recipients: {
      findRecipient: async (userId) => {
        const user = await auth.findUserByIdForNotification(userId);
        return user
          ? { id: user.id, email: user.email, isDeleted: user.is_deleted }
          : undefined;
      },
      findRecipients: (userIds) =>
        auth.listNotificationRecipientsByIds(userIds),
    },
  });

  const intervalMs = config.NOTIFICATION_INLINE_INTERVAL_SECONDS * 1000;
  let stopped = false;
  let activeCycle: Promise<void> | null = null;
  let timer: NodeJS.Timeout | null = null;

  const runCycle = () => {
    if (stopped || activeCycle) return;
    const cycle = (async () => {
      try {
        const result = await processor.process();
        const didWork =
          result.outbox.processed +
            result.outbox.retried +
            result.outbox.failed +
            result.email.sent +
            result.email.retried +
            result.email.failed >
          0;
        if (didWork) {
          app.log.info(
            { job: "notification-inline-worker", ...result },
            "Notification processing cycle complete",
          );
        }
      } catch (error) {
        app.log.error(
          { err: error, job: "notification-inline-worker" },
          "Notification processing cycle failed",
        );
      }
    })().finally(() => {
      activeCycle = null;
    });
    activeCycle = cycle;
  };

  app.log.info(
    { job: "notification-inline-worker", intervalSeconds: intervalMs / 1000 },
    "Starting inline notification worker (set NOTIFICATION_INLINE_WORKER=false to disable)",
  );
  runCycle();
  timer = setInterval(runCycle, intervalMs);
  timer.unref();

  return async () => {
    stopped = true;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    await activeCycle;
  };
}
