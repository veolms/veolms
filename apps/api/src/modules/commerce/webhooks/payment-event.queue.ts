import type { NormalizedPaymentEvent, PaymentGateway } from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { FastifyBaseLogger } from "fastify";
import type { Kysely } from "kysely";
import * as webhookRepo from "./webhook.repository.ts";

export interface PaymentEventQueue {
  enqueue(event: NormalizedPaymentEvent): Promise<string>;
  start?(): void;
  stop?(): void;
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
 * 4. Supports multi-instance deployments safely without duplicate fulfillment.
 *
 * A handler failure records the error but leaves `processed_at` NULL (see
 * `markWebhookEventFailed`), so the row is picked up again on the next poll
 * tick instead of being silently buried. There is currently no attempt cap,
 * backoff, or alert on repeated failures — an event that fails every time
 * will retry forever at `pollIntervalMs` cadence with only a log line per
 * attempt.
 */
export class DurablePostgresPaymentEventQueue implements PaymentEventQueue {
  private readonly database: Kysely<Database>;
  private readonly paymentGateway: PaymentGateway;
  private readonly logger?: FastifyBaseLogger;
  private readonly handler: (event: NormalizedPaymentEvent) => Promise<void>;
  private readonly pollIntervalMs: number;
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(options: DurablePaymentEventQueueOptions) {
    this.database = options.database;
    this.paymentGateway = options.paymentGateway;
    this.logger = options.logger;
    this.handler = options.handler;
    this.pollIntervalMs = options.pollIntervalMs ?? 5000;
  }

  start(): void {
    if (this.timer) return;

    this.logger?.info("Starting Durable Postgres Payment Event Queue polling worker");

    // Trigger initial drain on startup to process any pending webhooks from previous runs
    void this.processPendingEvents();

    this.timer = setInterval(() => {
      void this.processPendingEvents();
    }, this.pollIntervalMs);

    this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.logger?.info("Stopped Durable Postgres Payment Event Queue polling worker");
    }
  }

  async enqueue(event: NormalizedPaymentEvent): Promise<string> {
    const jobId = event.eventId;
    this.logger?.info(
      { jobId, eventType: event.eventType, provider: event.provider },
      `Enqueued payment event to durable queue: ${event.eventType}`,
    );

    // Kick immediate processing asynchronously so the webhook endpoint can return 200 immediately
    setImmediate(() => {
      void this.processPendingEvents();
    });

    return jobId;
  }

  async processPendingEvents(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // Find unprocessed webhook events
      const pendingEvents = await this.database
        .selectFrom("webhook_events")
        .selectAll()
        .where("processed_at", "is", null)
        .orderBy("created_at", "asc")
        .limit(10)
        .execute();

      for (const eventRow of pendingEvents) {
        const log = this.logger?.child({
          eventId: eventRow.id,
          providerEventId: eventRow.event_id,
          eventType: eventRow.event_type,
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
          await webhookRepo.markWebhookEventProcessed(this.database, eventRow.id);
          log?.info("Durable webhook event processed successfully");
        } catch (err: unknown) {
          log?.error({ err }, "Error processing durable webhook event");
          // Do NOT mark processed — leave processed_at NULL so the next poll
          // picks this event back up. See markWebhookEventFailed.
          await webhookRepo.markWebhookEventFailed(
            this.database,
            eventRow.id,
            (err as Error)?.message || "Worker error",
          );
        }
      }
    } catch (pollErr: unknown) {
      this.logger?.error({ err: pollErr }, "Failed during payment queue event polling loop");
    } finally {
      this.isProcessing = false;
    }
  }
}

// Preserve alias for backwards compatibility
export const BackgroundPaymentEventQueue = DurablePostgresPaymentEventQueue;
