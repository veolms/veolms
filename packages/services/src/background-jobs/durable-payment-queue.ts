import crypto from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";
import type { NormalizedPaymentEvent, PaymentGateway } from "@veolms/contracts";

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
 * Guarantees zero dropped webhook events with immediate async drain and background polling recovery loop.
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
    await this.activePoll;
  }

  async enqueue(event: NormalizedPaymentEvent): Promise<string> {
    const jobId = event.eventId;
    this.logger?.info(
      { jobId, eventType: event.eventType, provider: event.provider },
      `Enqueued payment event to durable queue: ${event.eventType}`,
    );

    if (this.isStopped) return jobId;

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

  private async runPendingEvents(): Promise<void> {
    try {
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
          const normalizedEvent = this.paymentGateway.normalizeWebhookEvent(
            eventRow.payload,
            eventRow.event_id,
          );

          await this.handler({
            ...normalizedEvent,
            eventId: eventRow.id,
          });

          await this.database
            .updateTable("webhook_events")
            .set({
              processed_at: new Date(),
              error: null,
            })
            .where("id", "=", eventRow.id)
            .execute();

          log?.info("Durable webhook event processed successfully");
        } catch (err: unknown) {
          log?.error({ err }, "Error processing durable webhook event");
          const errorMessage =
            err instanceof Error ? err.message : "Worker error";
          await this.database
            .updateTable("webhook_events")
            .set({
              error: errorMessage,
            })
            .where("id", "=", eventRow.id)
            .execute();
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

export const BackgroundPaymentEventQueue = DurablePostgresPaymentEventQueue;

/**
 * Creates fulfillment worker to process normalized payment domain events.
 */
export function createPaymentWorker({
  database,
  logger,
}: {
  database: Kysely<Database>;
  logger?: FastifyBaseLogger;
}) {
  async function finalizePayment(
    paymentId: string,
    gatewayPaymentId: string,
    paymentMethod?: unknown,
  ) {
    const now = new Date();
    return database.transaction().execute(async (trx) => {
      const payment = await trx
        .selectFrom("payments")
        .selectAll()
        .where("id", "=", paymentId)
        .executeTakeFirst();

      if (!payment || payment.status === "captured") {
        return { outcome: "already_processed" as const };
      }

      await trx
        .updateTable("payments")
        .set({
          status: "captured",
          gateway_payment_id: gatewayPaymentId,
          payment_method: paymentMethod ? JSON.stringify(paymentMethod) : null,
          updated_at: now,
        })
        .where("id", "=", paymentId)
        .execute();

      const order = await trx
        .selectFrom("orders")
        .selectAll()
        .where("id", "=", payment.order_id)
        .executeTakeFirst();

      if (!order) {
        return { outcome: "order_not_found" as const };
      }

      await trx
        .updateTable("orders")
        .set({
          status: "paid",
          paid_at: now,
          updated_at: now,
        })
        .where("id", "=", order.id)
        .execute();

      const orderItems = await trx
        .selectFrom("order_items")
        .selectAll()
        .where("order_id", "=", order.id)
        .execute();

      let enrollmentCount = 0;
      for (const item of orderItems) {
        if (item.item_type === "course" && item.course_id) {
          await trx
            .insertInto("enrollments")
            .values({
              id: crypto.randomUUID(),
              user_id: order.user_id,
              course_id: item.course_id,
              order_id: order.id,
              status: "active",
              source: "direct_purchase",
            })
            .onConflict((oc) =>
              oc
                .columns(["user_id", "course_id"])
                .doUpdateSet({ status: "active", updated_at: now }),
            )
            .execute();
          enrollmentCount++;
        } else if (item.item_type === "bundle" && item.bundle_id) {
          const bundleItems = await trx
            .selectFrom("course_bundle_items")
            .select("course_id")
            .where("bundle_id", "=", item.bundle_id)
            .execute();

          for (const bi of bundleItems) {
            await trx
              .insertInto("enrollments")
              .values({
                id: crypto.randomUUID(),
                user_id: order.user_id,
                course_id: bi.course_id,
                order_id: order.id,
                status: "active",
                source: "bundle_purchase",
              })
              .onConflict((oc) =>
                oc
                  .columns(["user_id", "course_id"])
                  .doUpdateSet({ status: "active", updated_at: now }),
              )
              .execute();
            enrollmentCount++;
          }
        }
      }

      await trx
        .insertInto("outbox_events")
        .values({
          id: crypto.randomUUID(),
          event_type: "payment.captured",
          dedupe_key: `payment.captured:${payment.id}`,
          payload: JSON.stringify({
            paymentId: payment.id,
            orderId: order.id,
            orderNumber: order.order_number,
            userId: order.user_id,
            amount: payment.amount,
            currency: payment.currency,
          }),
        })
        .execute();

      return {
        outcome: "finalized" as const,
        orderId: order.id,
        enrollmentCount,
      };
    });
  }

  async function processPaymentJob(event: NormalizedPaymentEvent) {
    const log = logger?.child({
      job: "payment-worker",
      eventId: event.eventId,
      eventType: event.eventType,
    });

    if (event.eventType === "payment.succeeded") {
      if (!event.gatewayOrderId || !event.gatewayPaymentId) {
        log?.warn("Successful payment event is missing gateway identifiers");
        return { status: "skipped" as const };
      }

      const payment = await database
        .selectFrom("payments")
        .selectAll()
        .where("gateway_order_id", "=", event.gatewayOrderId)
        .executeTakeFirst();

      if (!payment) {
        log?.warn(
          { gatewayOrderId: event.gatewayOrderId },
          "No payment record found",
        );
        return { status: "skipped" as const };
      }

      const result = await finalizePayment(
        payment.id,
        event.gatewayPaymentId,
        event.paymentMethod,
      );

      log?.info(
        {
          outcome: result.outcome,
          orderId: "orderId" in result ? result.orderId : undefined,
        },
        "Payment event handled",
      );

      return {
        status: "processed" as const,
        orderId: "orderId" in result ? result.orderId : undefined,
      };
    }

    if (event.eventType === "payment.failed") {
      if (!event.gatewayOrderId) return { status: "skipped" as const };

      const payment = await database
        .selectFrom("payments")
        .selectAll()
        .where("gateway_order_id", "=", event.gatewayOrderId)
        .executeTakeFirst();

      if (!payment || payment.status === "captured") {
        return { status: "skipped" as const };
      }

      const now = new Date();
      await database
        .updateTable("payments")
        .set({
          status: "failed",
          error_code: event.errorCode ?? "PAYMENT_FAILED",
          error_description: event.errorDescription ?? "Payment failed",
          updated_at: now,
        })
        .where("id", "=", payment.id)
        .execute();

      log?.info({ paymentId: payment.id }, "Payment failure handled");
      return { status: "processed" as const, orderId: payment.order_id };
    }

    return { status: "processed" as const };
  }

  return { processPaymentJob, finalizePayment };
}
