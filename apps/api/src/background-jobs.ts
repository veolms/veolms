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
import { findIdsMentionedInCourseContent } from "./modules/courses/curriculum/course-content-reference.service.ts";
import { createDiscussionUploadStore } from "./modules/discussion-uploads/index.ts";
import { createAttachmentsRepository } from "./modules/learning/discussions/attachments/attachments.repository.ts";
import { createAttachmentsService } from "./modules/learning/discussions/attachments/attachments.service.ts";
import { createNotificationProcessor } from "./modules/notifications/index.ts";
import { startYoutubeImportWorker } from "./modules/media/youtube-import/youtube-import.worker.ts";
import { getYoutubeImportTools } from "./modules/media/youtube-import/youtube-import.tools.ts";
import {
  createInvoiceService,
  invoiceStorage,
} from "./modules/commerce/invoices/invoice.service.ts";
import { createInvoiceAttachmentResolver } from "./modules/commerce/invoices/invoice-email-attachment.ts";
import { getCacheStats } from "@veolms/api-core";
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
    // With the gateway, an extra payment is refunded as soon as its event
    // is processed rather than on the scheduler's next pass.
    paymentGateway: services.paymentGateway,
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

  const stopDiscussionUploadPurge =
    config.DISCUSSION_UPLOAD_PURGE_INTERVAL_HOURS > 0
      ? startDiscussionUploadPurge(app, database, services)
      : null;

  const stopInvoicePdfJob = startInvoicePdfJob(app, database, services);

  // "Import from YouTube": off unless an operator turns it on, because it
  // downloads and packages video on this host.
  const stopYoutubeImportWorker = config.YOUTUBE_IMPORT_ENABLED
    ? startYoutubeImportWorker({
        database,
        services,
        tools: getYoutubeImportTools(services.config, app.log),
        logger: app.log,
      })
    : null;

  app.addHook("onClose", async () => {
    await paymentEventQueue.stop?.();
    // Awaited so an in-flight reconciliation cycle finishes before the
    // shared Kysely instance is destroyed right after these hooks.
    await fulfillmentScheduler.stop();
    await learningReminderWorker.stop();
    await stopNotificationLoop?.();
    await stopDiscussionUploadPurge?.();
    await stopInvoicePdfJob?.();
    await stopYoutubeImportWorker?.();
    stopHeartbeat?.();
  });

  return paymentEventQueue;
}

const INVOICE_PDF_JOB = "invoice-pdf";
const INVOICE_PDF_INTERVAL_MS = 10_000;
/** Most PDFs one run makes; the rest wait for the next run. */
const INVOICE_PDF_BATCH = 20;
/**
 * How far back the job looks. Older orders (and students brought over from
 * another platform) get their PDF on their first download instead.
 */
const INVOICE_PDF_LOOKBACK_MS = 2 * 24 * 60 * 60 * 1000;
/** The longest an order whose PDF keeps failing waits between tries. */
const INVOICE_PDF_RETRY_MAX_MS = 60 * 60 * 1000;

/**
 * Makes each paid order's invoice PDF shortly after payment and keeps it in
 * object storage, where downloads are served from. Payment itself never
 * waits for, or fails on, the PDF: a run that fails leaves the order for the
 * next run, and a download makes the PDF if it is still missing.
 *
 * Each API instance runs its own timer. That is safe: an order made twice
 * at once is the same file written to the same place.
 *
 * Returns an async stop function that waits for a run under way, or null
 * when there is no object storage to keep invoices in.
 */
function startInvoicePdfJob(
  app: FastifyInstance,
  database: Kysely<Database>,
  services: AppServices,
): (() => Promise<void>) | null {
  const storage = invoiceStorage(services.storage);
  if (!storage) {
    app.log.info(
      { job: INVOICE_PDF_JOB },
      "Invoice PDFs are not stored: no object storage credentials; each download makes the PDF instead",
    );
    return null;
  }
  const invoices = createInvoiceService({ database, storage });
  let stopped = false;
  let activeCycle: Promise<void> | null = null;
  // An order whose PDF failed waits before it is tried again, longer after
  // each failure, so one that keeps failing neither fills the log nor takes
  // a place in every run.
  const retries = new Map<string, { failures: number; notBefore: number }>();

  const runCycle = () => {
    if (stopped || activeCycle) return;
    activeCycle = (async () => {
      try {
        const now = Date.now();
        for (const [orderId, retry] of retries) {
          // Past the lookback the job no longer sees the order anyway.
          if (retry.notBefore < now - INVOICE_PDF_LOOKBACK_MS) {
            retries.delete(orderId);
          }
        }
        const result = await invoices.issuePendingInvoicePdfs({
          paidSince: new Date(now - INVOICE_PDF_LOOKBACK_MS),
          limit: INVOICE_PDF_BATCH,
          excludeOrderIds: [...retries]
            .filter(([, retry]) => retry.notBefore > now)
            .map(([orderId]) => orderId),
        });
        if (result.issued > 0) {
          app.log.info(
            { job: INVOICE_PDF_JOB, issued: result.issued },
            "Invoice PDFs made",
          );
        }
        for (const { orderId, error } of result.failures) {
          const failures = (retries.get(orderId)?.failures ?? 0) + 1;
          retries.set(orderId, {
            failures,
            notBefore:
              Date.now() +
              Math.min(INVOICE_PDF_RETRY_MAX_MS, 60_000 * 2 ** (failures - 1)),
          });
          app.log.warn(
            { err: error, job: INVOICE_PDF_JOB, orderId, failures },
            "Invoice PDF could not be made; it will be tried again",
          );
        }
      } catch (error) {
        app.log.error(
          { err: error, job: INVOICE_PDF_JOB },
          "Invoice PDF run failed",
        );
      }
    })().finally(() => {
      activeCycle = null;
    });
  };

  const timer = setInterval(runCycle, INVOICE_PDF_INTERVAL_MS);
  timer.unref();

  return async () => {
    stopped = true;
    clearInterval(timer);
    await activeCycle;
  };
}

const DISCUSSION_UPLOAD_PURGE_JOB = "discussion-upload-retention";
const DISCUSSION_UPLOAD_PURGE_FIRST_RUN_MS = 30_000;
/** The most uploads one run removes; the script's own default. */
const DISCUSSION_UPLOAD_PURGE_LIMIT = 1000;
const HOUR_MS = 60 * 60 * 1000;

/**
 * Removes discussion uploads that were never attached to a post, on a timer.
 *
 * The work is the `purge:discussion-uploads` script's (jobs/
 * discussion-upload-retention.ts) with `--apply`, under the same rules: an
 * upload goes only when it is unattached, older than
 * DISCUSSION_UPLOAD_ORPHAN_RETENTION_DAYS, and mentioned by no post, note,
 * lesson or course text. Nothing scheduled that script, so those uploads
 * were kept for good.
 *
 * Off unless DISCUSSION_UPLOAD_PURGE_INTERVAL_HOURS is set: this deletes
 * stored files, so an operator turns it on. Each API instance runs its own
 * timer. That is safe: an upload's row is marked removed first, and only
 * while it is still unattached, so two instances cannot both take one.
 *
 * Returns an async stop function that waits for a run under way, or null
 * when the job was not started.
 */
function startDiscussionUploadPurge(
  app: FastifyInstance,
  database: Kysely<Database>,
  services: AppServices,
): (() => Promise<void>) | null {
  // As in the script: without storage credentials the upload store works on
  // the local disk only, and a deployment would record uploads as removed
  // while their files stayed in the bucket.
  if (
    config.NODE_ENV === "production" &&
    !(config.STORAGE_ACCESS_KEY_ID && config.STORAGE_SECRET_ACCESS_KEY)
  ) {
    app.log.warn(
      { job: DISCUSSION_UPLOAD_PURGE_JOB },
      "Discussion upload purge not started: it needs the object storage credentials (STORAGE_ACCESS_KEY_ID, STORAGE_SECRET_ACCESS_KEY)",
    );
    return null;
  }

  const attachments = createAttachmentsService(
    createAttachmentsRepository(),
    createDiscussionUploadStore(services.storage),
    services.storage,
  );
  const intervalHours = config.DISCUSSION_UPLOAD_PURGE_INTERVAL_HOURS;
  const retentionDays = config.DISCUSSION_UPLOAD_ORPHAN_RETENTION_DAYS;
  let stopped = false;
  let activeCycle: Promise<void> | null = null;

  const runCycle = () => {
    if (stopped || activeCycle) return;
    const cycle = (async () => {
      try {
        const result = await attachments.purgeAbandonedUploads(database, {
          olderThan: new Date(Date.now() - retentionDays * 24 * HOUR_MS),
          apply: true,
          limit: DISCUSSION_UPLOAD_PURGE_LIMIT,
          findReferencedElsewhere: (attachmentIds) =>
            findIdsMentionedInCourseContent(database, attachmentIds),
        });
        // `failed` uploads could not be removed; they are tried again on
        // the next run.
        app.log[result.failed > 0 ? "warn" : "info"](
          { job: DISCUSSION_UPLOAD_PURGE_JOB, retentionDays, ...result },
          "Discussion upload purge complete",
        );
      } catch (error) {
        app.log.error(
          { err: error, job: DISCUSSION_UPLOAD_PURGE_JOB },
          "Discussion upload purge failed",
        );
      }
    })().finally(() => {
      activeCycle = null;
    });
    activeCycle = cycle;
  };

  app.log.info(
    { job: DISCUSSION_UPLOAD_PURGE_JOB, intervalHours, retentionDays },
    "Starting discussion upload purge (set DISCUSSION_UPLOAD_PURGE_INTERVAL_HOURS=0 to disable)",
  );
  // First run shortly after startup, off the boot hot path.
  const initialTimer = setTimeout(
    runCycle,
    DISCUSSION_UPLOAD_PURGE_FIRST_RUN_MS,
  );
  initialTimer.unref();
  const timer = setInterval(runCycle, intervalHours * HOUR_MS);
  timer.unref();

  return async () => {
    stopped = true;
    clearTimeout(initialTimer);
    clearInterval(timer);
    await activeCycle;
  };
}

/**
 * Periodic one-line ops gauge: pool saturation, queue depths and caches.
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
          caches: getCacheStats(),
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
    attachments: createInvoiceAttachmentResolver(
      createInvoiceService({
        database,
        storage: invoiceStorage(services.storage),
      }),
    ),
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
