import type { ServerConfig } from "@veolms/config";
import type { Database, NotificationDeliveryLane } from "@veolms/database";
import type { FastifyBaseLogger } from "fastify";
import { sql, type Kysely } from "kysely";
import { z } from "zod";

import * as outboxRepository from "../../events/outbox.repository.ts";
import type { EmailAttachment, EmailService } from "@veolms/services/email";
import { classifyEmailFailure } from "./email-failure.ts";
import { addEmailSuppression } from "./email-suppressions.repository.ts";
import {
  createNotificationIntents,
  UnknownNotificationEventError,
} from "./notifications.handlers.ts";
import * as notificationRepository from "./notifications.repository.ts";
import {
  CHAT_MESSAGE_SENT_EVENT,
  type ChatPushSource,
  type NotificationAttachmentResolver,
  type NotificationEmailAttachment,
  type NotificationHandlerDependencies,
  type NotificationRecipientDirectory,
  type NotificationCalendarInviteBuilder,
} from "./notifications.types.ts";
import type { PushSender, PushSendResult } from "./push/push-sender.ts";
import { createNotificationService } from "./notifications.service.ts";

const emailDeliveryPayloadSchema = z.strictObject({
  subject: z.string().min(1),
  text: z.string().min(1),
  html: z.string().min(1),
  attachments: z
    .array(
      z.strictObject({ kind: z.literal("order-invoice"), orderId: z.uuid() }),
    )
    .optional(),
  calendar: z
    .strictObject({
      kind: z.literal("workshop-invite"),
      workshopId: z.uuid(),
      method: z.enum(["REQUEST", "CANCEL"]),
    })
    .optional(),
  /** List-Unsubscribe and friends, decided when the email was queued. */
  headers: z.record(z.string(), z.string()).optional(),
});

/**
 * Only one process sends queued email at a time. Every API process runs the
 * inline worker, and six of them sending at once from one mailbox is what
 * made providers throttle the domain; with the lock, the per-process send
 * rate (EMAIL_RATE_PER_SECOND) is the account's rate. Outbox and push
 * processing are not locked: they are safe in parallel.
 */
const EMAIL_SENDER_LOCK_KEY = 820_261_110;

export interface NotificationProcessorResult {
  outbox: { processed: number; retried: number; failed: number };
  email: { sent: number; retried: number; failed: number };
  /** Null while push is off. */
  push: PushSendResult | null;
  cleanedUp: number;
}

export interface NotificationProcessor {
  process(): Promise<NotificationProcessorResult>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * A PostgreSQL "data exception" (SQLSTATE class 22: text jsonb refuses, a
 * value too long, ...). The same event fails the same way every time, so
 * retrying it only delays the failure.
 */
function isDataError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && code.startsWith("22");
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
  attachments,
  calendarInvites,
  push,
  chat,
}: {
  /** Builds workshop calendar invitations; without it they are left out. */
  calendarInvites?: NotificationCalendarInviteBuilder;
  database: Kysely<Database>;
  email: EmailService;
  /**
   * Fetches the files an email carries (an order's invoice). Without it,
   * such emails go out without their files.
   */
  attachments?: NotificationAttachmentResolver;
  logger: FastifyBaseLogger;
  config: Pick<
    ServerConfig,
    | "NOTIFICATION_BATCH_SIZE"
    | "NOTIFICATION_BULK_PER_CYCLE"
    | "NOTIFICATION_LEASE_SECONDS"
    | "NOTIFICATION_OUTBOX_MAX_ATTEMPTS"
    | "NOTIFICATION_EMAIL_MAX_ATTEMPTS"
    | "NOTIFICATION_RETRY_SECONDS"
    | "NOTIFICATION_THROTTLE_PAUSE_SECONDS"
    | "NOTIFICATION_OUTBOX_RETENTION_DAYS"
    | "NOTIFICATION_COURSE_WIDE_EMAIL"
    | "NOTIFICATION_COURSE_WIDE_PUSH"
  >;
  handlers: NotificationHandlerDependencies;
  recipients: NotificationRecipientDirectory;
  /** Phone pushes; absent or null while push is off or not set up. */
  push?: PushSender | null;
  /** Who gets a chat message's push (the chat module's rules). */
  chat?: ChatPushSource;
}): NotificationProcessor {
  const service = createNotificationService({
    database,
    pushEnabled: Boolean(push),
    webPushEnabled: push?.sendsToBrowsers ?? false,
  });
  const log = logger.child({ job: "notification-worker" });

  /**
   * When each lane may send again. A lane rests after the provider
   * throttles us or refuses a message for policy: sending more right then
   * only burns quota and reputation. Kept in memory: the lock above means
   * one process sends, and a restart simply tries again.
   */
  const lanePausedUntil = new Map<NotificationDeliveryLane, number>();

  function lanePauseEnd(lane: NotificationDeliveryLane, nowMs: number) {
    const until = lanePausedUntil.get(lane);
    return until !== undefined && until > nowMs ? until : null;
  }

  function pauseLane(
    lane: NotificationDeliveryLane,
    nowMs: number,
    reason: string,
  ) {
    const until = nowMs + config.NOTIFICATION_THROTTLE_PAUSE_SECONDS * 1000;
    const current = lanePausedUntil.get(lane) ?? 0;
    if (until <= current) return;
    lanePausedUntil.set(lane, until);
    log.warn(
      { lane, pausedUntil: new Date(until).toISOString(), reason },
      "Email lane paused",
    );
  }

  async function processOutbox() {
    const now = new Date();
    const leaseUntil = new Date(
      now.getTime() + config.NOTIFICATION_LEASE_SECONDS * 1000,
    );
    const claimed = await outboxRepository.claimBatch(database, {
      limit: config.NOTIFICATION_BATCH_SIZE,
      now,
      leaseUntil,
      maxAttempts: config.NOTIFICATION_OUTBOX_MAX_ATTEMPTS,
    });
    const result = { processed: 0, retried: 0, failed: 0 };

    for (const event of claimed) {
      try {
        if (event.event_version !== 1) {
          throw new UnknownNotificationEventError(
            `${event.event_type}@v${event.event_version}`,
          );
        }
        if (event.event_type === CHAT_MESSAGE_SENT_EVENT) {
          // Chat messages are pushed only: the chat is their in-app view.
          const message =
            push && chat ? await chat.resolveMessagePush(event.payload) : null;
          const { queued } = await service.processChatMessageEvent(
            event,
            message,
          );
          result.processed += 1;
          if (queued > 0) {
            log.debug(
              { eventId: event.id, pushesQueued: queued },
              "Chat message pushes queued",
            );
          }
          continue;
        }
        const intents = await createNotificationIntents(
          event.event_type,
          event.payload,
          {
            ...handlers,
            courseWideEmail: config.NOTIFICATION_COURSE_WIDE_EMAIL,
            courseWidePush: config.NOTIFICATION_COURSE_WIDE_PUSH,
          },
        );
        const outcome = await service.processClaimedEvent(
          event,
          intents,
          recipients,
        );
        result.processed += 1;
        // The notifications are committed: tell the recipients' open
        // streams. A failure here loses nothing (those tabs still poll), so
        // it never fails the event.
        if (outcome.notifiedUserIds.length > 0) {
          await service
            .signalUsersChanged(outcome.notifiedUserIds)
            .catch((error: unknown) => {
              log.warn(
                { err: error, eventId: event.id },
                "Could not signal notification streams",
              );
            });
        }
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
        // attempt_count was already incremented at claim time.
        const attemptCount = event.attempt_count;
        const message = errorMessage(error);
        const permanent =
          error instanceof z.ZodError ||
          error instanceof UnknownNotificationEventError ||
          isDataError(error);
        if (
          permanent ||
          attemptCount >= config.NOTIFICATION_OUTBOX_MAX_ATTEMPTS
        ) {
          await outboxRepository.markFailed(database, {
            eventId: event.id,
            error: message,
            lockedUntil: leaseUntil,
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
            availableAt: retryAt(
              failureTime,
              attemptCount,
              config.NOTIFICATION_RETRY_SECONDS,
            ),
            error: message,
            lockedUntil: leaseUntil,
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

  /**
   * The files an email carries. A file that cannot be had throws, so the
   * email is tried again later, unless `lastTry`: then it is left out.
   */
  async function resolveAttachments(
    wanted: readonly NotificationEmailAttachment[],
    deliveryId: string,
    lastTry: boolean,
  ): Promise<EmailAttachment[]> {
    const files: EmailAttachment[] = [];
    for (const attachment of wanted) {
      if (!attachments) {
        log.warn(
          { deliveryId, attachment },
          "No attachment resolver; email sent without its file",
        );
        continue;
      }
      try {
        files.push(await attachments.resolve(attachment));
      } catch (error) {
        if (!lastTry) throw error;
        log.warn(
          { err: error, deliveryId, attachment },
          "Email attachment unavailable on the last try; sent without it",
        );
      }
    }
    return files;
  }

  const noEmailWork = { sent: 0, retried: 0, failed: 0 };

  async function processEmail() {
    // The lock lives for this transaction, which only holds the lock: the
    // sends and their marks use the pool as before.
    return await database.transaction().execute(async (lockHolder) => {
      const lock = await sql<{ locked: boolean }>`
        select pg_try_advisory_xact_lock(${sql.lit(EMAIL_SENDER_LOCK_KEY)}) as locked
      `.execute(lockHolder);
      if (!lock.rows[0]?.locked) {
        log.debug("Another process is sending email; skipped this cycle");
        return noEmailWork;
      }
      return await sendDueEmails();
    });
  }

  async function sendDueEmails() {
    const now = new Date();
    const leaseMs = config.NOTIFICATION_LEASE_SECONDS * 1000;
    let leaseUntil = new Date(now.getTime() + leaseMs);
    let leaseStartedAt = now.getTime();
    const claimed = await notificationRepository.claimEmailDeliveries(
      database,
      {
        limit: config.NOTIFICATION_BATCH_SIZE,
        bulkLimit:
          lanePauseEnd("bulk", now.getTime()) === null
            ? config.NOTIFICATION_BULK_PER_CYCLE
            : 0,
        transactionalPaused:
          lanePauseEnd("transactional", now.getTime()) !== null,
        now,
        leaseUntil,
        maxAttempts: config.NOTIFICATION_EMAIL_MAX_ATTEMPTS,
      },
    );
    const result = { ...noEmailWork };

    for (const [index, delivery] of claimed.entries()) {
      // A slow provider must not make the batch outlive its lease: another
      // worker would re-claim and re-send what is still in flight here.
      if (Date.now() - leaseStartedAt > leaseMs / 2) {
        const extended = new Date(Date.now() + leaseMs);
        await notificationRepository.extendDeliveryLeases(database, {
          deliveryIds: claimed.slice(index).map((row) => row.id),
          from: leaseUntil,
          to: extended,
        });
        leaseUntil = extended;
        leaseStartedAt = Date.now();
      }

      // The lane rested after this batch was claimed (an earlier message in
      // it was throttled): back to the queue, no attempt burned.
      const pausedUntil = lanePauseEnd(delivery.lane, Date.now());
      if (pausedUntil !== null) {
        await notificationRepository.markDeliveryRetry(database, {
          deliveryId: delivery.id,
          nextAttemptAt: new Date(pausedUntil),
          error: "Lane paused after a provider throttle",
          now: new Date(),
          lockedUntil: leaseUntil,
          rewindAttempt: true,
        });
        result.retried += 1;
        continue;
      }

      try {
        if (!delivery.destination) {
          throw new Error("Email delivery has no destination.");
        }
        const {
          attachments: wanted = [],
          calendar: wantedCalendar,
          headers = {},
          ...content
        } = emailDeliveryPayloadSchema.parse(delivery.payload);
        const files = await resolveAttachments(
          wanted,
          delivery.id,
          // The last try sends the email without a file it cannot get,
          // rather than not at all.
          delivery.attempt_count >= config.NOTIFICATION_EMAIL_MAX_ATTEMPTS,
        );
        const calendar =
          wantedCalendar && calendarInvites
            ? await calendarInvites.build({
                workshopId: wantedCalendar.workshopId,
                method: wantedCalendar.method,
                attendeeEmail: delivery.destination,
              })
            : null;
        const sendResult = await email.send(delivery.destination, content, {
          attachments: files,
          ...(calendar ? { calendar } : {}),
          // One id per delivery: Gmail then shows each notice on its own
          // instead of threading a learner's reminders into one.
          headers: { ...headers, "X-Entity-Ref-ID": delivery.id },
        });
        if (sendResult.status === "failed") throw sendResult.error;

        await notificationRepository.markDeliverySent(database, {
          deliveryId: delivery.id,
          providerMessageId:
            sendResult.status === "sent" ? sendResult.messageId : null,
          now: new Date(),
          lockedUntil: leaseUntil,
        });
        result.sent += 1;
      } catch (error) {
        // attempt_count was already incremented at claim time.
        const attemptCount = delivery.attempt_count;
        const message = errorMessage(error);
        const failure = classifyEmailFailure(error);
        const failureTime = new Date();

        if (failure.pauseLane) {
          pauseLane(delivery.lane, failureTime.getTime(), failure.reason);
        }
        if (failure.suppress && delivery.destination) {
          await addEmailSuppression(database, {
            email: delivery.destination,
            reason: "hard_bounce",
            source: "smtp",
            detail: message,
          });
        }

        if (failure.kind === "throttled") {
          await notificationRepository.markDeliveryRetry(database, {
            deliveryId: delivery.id,
            nextAttemptAt: new Date(
              failureTime.getTime() +
                config.NOTIFICATION_THROTTLE_PAUSE_SECONDS * 1000,
            ),
            error: `${failure.reason}: ${message}`,
            now: failureTime,
            lockedUntil: leaseUntil,
            rewindAttempt: true,
          });
          result.retried += 1;
          log.warn(
            { err: error, deliveryId: delivery.id, lane: delivery.lane },
            "Provider throttled email; lane paused",
          );
        } else if (
          failure.kind === "permanent" ||
          attemptCount >= config.NOTIFICATION_EMAIL_MAX_ATTEMPTS
        ) {
          await notificationRepository.markDeliveryFailed(database, {
            deliveryId: delivery.id,
            error: `${failure.reason}: ${message}`,
            now: failureTime,
            lockedUntil: leaseUntil,
          });
          result.failed += 1;
          log.error(
            {
              err: error,
              deliveryId: delivery.id,
              lane: delivery.lane,
              suppressed: failure.suppress,
            },
            "Notification email failed permanently",
          );
        } else {
          await notificationRepository.markDeliveryRetry(database, {
            deliveryId: delivery.id,
            nextAttemptAt: retryAt(
              failureTime,
              attemptCount,
              config.NOTIFICATION_RETRY_SECONDS,
            ),
            error: `${failure.reason}: ${message}`,
            now: failureTime,
            lockedUntil: leaseUntil,
          });
          result.retried += 1;
          log.warn(
            { err: error, deliveryId: delivery.id, lane: delivery.lane },
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
    const pushResult = push ? await push.process() : null;
    if (push) {
      await push
        .maintain(config.NOTIFICATION_OUTBOX_RETENTION_DAYS)
        .catch((error: unknown) => {
          log.warn({ err: error }, "Push upkeep failed; tried again later");
        });
    }
    const olderThan = new Date(
      Date.now() -
        config.NOTIFICATION_OUTBOX_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    const cleanedUp = await outboxRepository.cleanupProcessed(
      database,
      olderThan,
    );
    return { outbox, email: emailResult, push: pushResult, cleanedUp };
  }

  return { process };
}
