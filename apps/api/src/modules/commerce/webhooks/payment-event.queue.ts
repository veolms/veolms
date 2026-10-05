import type { NormalizedPaymentEvent, PaymentGateway } from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { FastifyBaseLogger } from "fastify";
import type { Kysely } from "kysely";
import * as webhookRepo from "./webhook.repository.ts";

export interface PaymentEventQueue {
  enqueue(event: NormalizedPaymentEvent): Promise<string>;
  start?(): void;
  stop?(): Promise<void>;
}

export interface DurablePaymentEventQueueOptions {
  database: Kysely<Database>;
  paymentGateway: PaymentGateway;
  logger?: FastifyBaseLogger;
  handler: (event: NormalizedPaymentEvent) => Promise<void>;
  pollIntervalMs?: number;
}

/**
 * Durable, PostgreSQL-backed payment event queue.
 *
 * Guarantees zero dropped webhook events:
 * 1. Webhook events are safely persisted in the `webhook_events` table before queueing.
 * 2. Processes events immediately via `setImmediate()` for near-zero latency.
 * 3. Runs a background recovery loop that polls for any unprocessed `webhook_events`
 *    (e.g., from server restarts, crash recoveries, or unhandled exceptions).
 * 4. Supports multi-instance deployments safely: rows are claimed with
 *    `FOR UPDATE SKIP LOCKED` plus a short lease (`next_attempt_at`), so two
 *    replicas never process the same event concurrently.
 *
 * A handler failure records the error, leaves `processed_at` NULL, and
 * schedules the retry with exponential backoff (claim-counted `attempts`,
 * `RETRY_BASE_DELAY_SECONDS * 2^attempts`, capped at `RETRY_MAX_DELAY_SECONDS`).
 * After `MAX_ATTEMPTS` the event is dead-lettered (`dead_at` set): it stops
 * being claimed — so a poisoned event can no longer occupy one of the poll
 * batch's slots and starve every newer webhook (head-of-line blocking) — but
 * stays in the table for operators to inspect and requeue (clear `dead_at`).
 */
export class DurablePostgresPaymentEventQueue implements PaymentEventQueue {
  private readonly database: Kysely<Database>;
  private readonly paymentGateway: PaymentGateway;
  private readonly logger?: FastifyBaseLogger;
  private readonly handler: (event: NormalizedPaymentEvent) => Promise<void>;
  private readonly pollIntervalMs: number;
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private isStopped = true;
  private activePoll: Promise<void> | null = null;

  constructor(options: DurablePaymentEventQueueOptions) {
    this.database = options.database;
    this.paymentGateway = options.paymentGateway;
    this.logger = options.logger;
    this.handler = options.handler;
    this.pollIntervalMs = options.pollIntervalMs ?? 5000;
  }

  start(): void {
    if (this.timer) return;

    this.isStopped = false;
    this.logger?.info(
      "Starting Durable Postgres Payment Event Queue polling worker",
    );

    // Trigger initial drain on startup to process any pending webhooks from previous runs
    void this.processPendingEvents();

    this.timer = setInterval(() => {
      void this.processPendingEvents();
    }, this.pollIntervalMs);

    this.timer.unref();
  }

  async stop(): Promise<void> {
    this.isStopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.logger?.info(
        "Stopped Durable Postgres Payment Event Queue polling worker",
      );
    }

    // The API destroys its shared database only after Fastify's onClose hooks
    // complete. Wait for an already-running poll so it cannot acquire the
    // destroyed Kysely driver during a restart or failed listen attempt.
    await this.activePoll;
  }

  async enqueue(event: NormalizedPaymentEvent): Promise<string> {
    const jobId = event.eventId;
    this.logger?.info(
      { jobId, eventType: event.eventType, provider: event.provider },
      `Enqueued payment event to durable queue: ${event.eventType}`,
    );

    if (this.isStopped) return jobId;

    // Kick immediate processing asynchronously so the webhook endpoint can return 200 immediately
    setImmediate(() => {
      void this.processPendingEvents();
    });

    return jobId;
  }

  async processPendingEvents(): Promise<void> {
    if (this.isStopped || this.isProcessing) return;
    this.isProcessing = true;
    const poll = this.runPendingEvents();
    this.activePoll = poll;

    try {
      await poll;
    } finally {
      if (this.activePoll === poll) this.activePoll = null;
      this.isProcessing = false;
    }
  }

  /** Attempts after which an event is dead-lettered instead of retried. */
  private static readonly MAX_ATTEMPTS = 8;
  /** First retry delay; doubles per attempt. */
  private static readonly RETRY_BASE_DELAY_SECONDS = 10;
  /** Upper bound on the retry delay. */
  private static readonly RETRY_MAX_DELAY_SECONDS = 3600;
  /**
   * Claim lease: how long a claimed row is invisible to other claimers while
   * being processed. Long enough for a slow fulfillment transaction, short
   * enough that a crashed claimer's row comes back quickly.
   */
  private static readonly CLAIM_LEASE_SECONDS = 120;

  private retryDelaySeconds(attempts: number): number {
    const exponential =
      DurablePostgresPaymentEventQueue.RETRY_BASE_DELAY_SECONDS *
      2 ** Math.min(attempts, 30);
    return Math.min(
      exponential,
      DurablePostgresPaymentEventQueue.RETRY_MAX_DELAY_SECONDS,
    );
  }

  private async runPendingEvents(): Promise<void> {
    try {
      // Atomically claim due events (FOR UPDATE SKIP LOCKED + lease) — safe
      // against other replicas and against a poll tick racing an enqueue kick.
      const pendingEvents = await webhookRepo.claimDueWebhookEvents(
        this.database,
        {
          limit: 10,
          leaseSeconds: DurablePostgresPaymentEventQueue.CLAIM_LEASE_SECONDS,
        },
      );

      for (const eventRow of pendingEvents) {
        const log = this.logger?.child({
          eventId: eventRow.id,
          providerEventId: eventRow.event_id,
          eventType: eventRow.event_type,
          attempt: eventRow.attempts,
        });

        try {
          // Reconstruct normalized domain event from stored database payload
          const normalizedEvent = this.paymentGateway.normalizeWebhookEvent(
            eventRow.payload,
            eventRow.event_id,
          );

          // Dispatch to worker handler (which delegates to PaymentReconciliationService)
          await this.handler({
            ...normalizedEvent,
            eventId: eventRow.id,
          });

          // Mark event as processed
          await webhookRepo.markWebhookEventProcessed(
            this.database,
            eventRow.id,
          );
          log?.info("Durable webhook event processed successfully");
        } catch (err: unknown) {
          const message = (err as Error)?.message || "Worker error";
          const isDead =
            eventRow.attempts >= DurablePostgresPaymentEventQueue.MAX_ATTEMPTS;

          if (isDead) {
            log?.error(
              { err },
              "Durable webhook event exhausted retries — dead-lettered. " +
                "Inspect webhook_events.error and clear dead_at to requeue.",
            );
          } else {
            log?.error(
              { err },
              "Error processing durable webhook event; will retry with backoff",
            );
          }

          await webhookRepo.markWebhookEventFailed(
            this.database,
            eventRow.id,
            message,
            isDead
              ? { deadAt: new Date() }
              : {
                  nextAttemptAt: new Date(
                    Date.now() +
                      this.retryDelaySeconds(eventRow.attempts) * 1000,
                  ),
                },
          );
        }
      }
    } catch (pollErr: unknown) {
      this.logger?.error(
        { err: pollErr },
        "Failed during payment queue event polling loop",
      );
    }
  }
}

// Preserve alias for backwards compatibility
export const BackgroundPaymentEventQueue = DurablePostgresPaymentEventQueue;
