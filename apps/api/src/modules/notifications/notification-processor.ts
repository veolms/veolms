import type { ServerConfig } from "@veolms/config";
import type { Database } from "@veolms/database";
import type { FastifyBaseLogger } from "fastify";
import type { Kysely } from "kysely";
import { z } from "zod";

import * as outboxRepository from "../../events/outbox.repository.ts";
import type { EmailService } from "../../services/email/index.ts";
import {
  createNotificationIntents,
  UnknownNotificationEventError,
} from "./notifications.handlers.ts";
import * as notificationRepository from "./notifications.repository.ts";
import type {
  NotificationHandlerDependencies,
  NotificationRecipientDirectory,
} from "./notifications.types.ts";
import { createNotificationService } from "./notifications.service.ts";

const emailDeliveryPayloadSchema = z.strictObject({
  subject: z.string().min(1),
  text: z.string().min(1),
  html: z.string().min(1),
});

export interface NotificationProcessorResult {
  outbox: { processed: number; retried: number; failed: number };
  email: { sent: number; retried: number; failed: number };
  cleanedUp: number;
}

export interface NotificationProcessor {
  process(): Promise<NotificationProcessorResult>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function retryAt(
  now: Date,
  attemptCount: number,
  retryScheduleSeconds: readonly number[],
): Date {
  const index = Math.min(
    Math.max(attemptCount - 1, 0),
    retryScheduleSeconds.length - 1,
  );
  return new Date(now.getTime() + retryScheduleSeconds[index]! * 1000);
}

export function createNotificationProcessor({
  database,
  email,
  logger,
  config,
  handlers,
  recipients,
}: {
  database: Kysely<Database>;
  email: EmailService;
  logger: FastifyBaseLogger;
  config: Pick<
    ServerConfig,
    | "NOTIFICATION_BATCH_SIZE"
    | "NOTIFICATION_LEASE_SECONDS"
    | "NOTIFICATION_OUTBOX_MAX_ATTEMPTS"
    | "NOTIFICATION_EMAIL_MAX_ATTEMPTS"
    | "NOTIFICATION_RETRY_SECONDS"
    | "NOTIFICATION_OUTBOX_RETENTION_DAYS"
  >;
  handlers: NotificationHandlerDependencies;
  recipients: NotificationRecipientDirectory;
}): NotificationProcessor {
  const service = createNotificationService({ database });
  const log = logger.child({ job: "notification-worker" });

  async function processOutbox() {
    const now = new Date();
    const claimed = await outboxRepository.claimBatch(database, {
      limit: config.NOTIFICATION_BATCH_SIZE,
      now,
      leaseUntil: new Date(
        now.getTime() + config.NOTIFICATION_LEASE_SECONDS * 1000,
      ),
    });
    const result = { processed: 0, retried: 0, failed: 0 };

    for (const event of claimed) {
      try {
        if (event.event_version !== 1) {
          throw new UnknownNotificationEventError(
            `${event.event_type}@v${event.event_version}`,
          );
        }
        const intents = await createNotificationIntents(
          event.event_type,
          event.payload,
          handlers,
        );
        const outcome = await service.processClaimedEvent(
          event,
          intents,
          recipients,
        );
        result.processed += 1;
        log.info(
          {
            eventId: event.id,
            eventType: event.event_type,
            notificationsCreated: outcome.created,
            notificationsSkipped: outcome.skipped,
          },
          "Notification event processed",
        );
      } catch (error) {
        const attemptCount = event.attempt_count + 1;
        const message = errorMessage(error);
        const permanent =
          error instanceof z.ZodError ||
          error instanceof UnknownNotificationEventError;
        if (
          permanent ||
          attemptCount >= config.NOTIFICATION_OUTBOX_MAX_ATTEMPTS
        ) {
          await outboxRepository.markFailed(database, {
            eventId: event.id,
            attemptCount,
            error: message,
          });
          result.failed += 1;
          log.error(
            { err: error, eventId: event.id, eventType: event.event_type },
            "Notification event failed permanently",
          );
        } else {
          const failureTime = new Date();
          await outboxRepository.markRetry(database, {
            eventId: event.id,
            attemptCount,
            availableAt: retryAt(
              failureTime,
              attemptCount,
              config.NOTIFICATION_RETRY_SECONDS,
            ),
            error: message,
          });
          result.retried += 1;
          log.warn(
            { err: error, eventId: event.id, eventType: event.event_type },
            "Notification event scheduled for retry",
          );
        }
      }
    }
    return result;
  }

  async function processEmail() {
    const now = new Date();
    const claimed = await notificationRepository.claimEmailDeliveries(
      database,
      {
        limit: config.NOTIFICATION_BATCH_SIZE,
        now,
        leaseUntil: new Date(
          now.getTime() + config.NOTIFICATION_LEASE_SECONDS * 1000,
        ),
      },
    );
    const result = { sent: 0, retried: 0, failed: 0 };

    for (const delivery of claimed) {
      try {
        if (!delivery.destination) {
          throw new Error("Email delivery has no destination.");
        }
        const payload = emailDeliveryPayloadSchema.parse(delivery.payload);
        const sendResult = await email.send(delivery.destination, payload);
        if (sendResult.status === "failed") throw sendResult.error;

        await notificationRepository.markDeliverySent(database, {
          deliveryId: delivery.id,
          providerMessageId:
            sendResult.status === "sent" ? sendResult.messageId : null,
          now: new Date(),
        });
        result.sent += 1;
      } catch (error) {
        const attemptCount = delivery.attempt_count + 1;
        const message = errorMessage(error);
        const permanent = error instanceof z.ZodError;
        const failureTime = new Date();
        if (
          permanent ||
          attemptCount >= config.NOTIFICATION_EMAIL_MAX_ATTEMPTS
        ) {
          await notificationRepository.markDeliveryFailed(database, {
            deliveryId: delivery.id,
            attemptCount,
            error: message,
            now: failureTime,
          });
          result.failed += 1;
          log.error(
            { err: error, deliveryId: delivery.id },
            "Notification email failed permanently",
          );
        } else {
          await notificationRepository.markDeliveryRetry(database, {
            deliveryId: delivery.id,
            attemptCount,
            nextAttemptAt: retryAt(
              failureTime,
              attemptCount,
              config.NOTIFICATION_RETRY_SECONDS,
            ),
            error: message,
            now: failureTime,
          });
          result.retried += 1;
          log.warn(
            { err: error, deliveryId: delivery.id },
            "Notification email scheduled for retry",
          );
        }
      }
    }
    return result;
  }

  async function process(): Promise<NotificationProcessorResult> {
    const outbox = await processOutbox();
    const emailResult = await processEmail();
    const olderThan = new Date(
      Date.now() -
        config.NOTIFICATION_OUTBOX_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    const cleanedUp = await outboxRepository.cleanupProcessed(
      database,
      olderThan,
    );
    return { outbox, email: emailResult, cleanedUp };
  }

  return { process };
}
