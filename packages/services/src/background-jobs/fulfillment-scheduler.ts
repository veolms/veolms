import type { FastifyBaseLogger } from "fastify";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";
import type { GatewayPaymentDetails, PaymentGateway } from "@veolms/contracts";
import { createPaymentWorker } from "./durable-payment-queue.ts";

export interface FulfillmentSchedulerOptions {
  database: Kysely<Database>;
  paymentGateway: PaymentGateway;
  logger?: FastifyBaseLogger;
  intervalMs?: number;
}

/**
 * Background scheduler for periodic commerce maintenance.
 */
export class CommerceFulfillmentScheduler {
  private readonly database: Kysely<Database>;
  private readonly paymentGateway: PaymentGateway;
  private readonly logger?: FastifyBaseLogger;
  private readonly intervalMs: number;
  private readonly paymentWorker: ReturnType<typeof createPaymentWorker>;
  private timer: NodeJS.Timeout | null = null;
  private initialTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(options: FulfillmentSchedulerOptions) {
    this.database = options.database;
    this.paymentGateway = options.paymentGateway;
    this.logger = options.logger;
    this.intervalMs = options.intervalMs ?? 5 * 60 * 1000;
    this.paymentWorker = createPaymentWorker({
      database: options.database,
      logger: options.logger,
    });
  }

  start(): void {
    if (this.timer) return;

    this.logger?.info(
      "Starting Commerce Fulfillment Scheduler (Order Expiration, Payment Recovery)",
    );

    this.initialTimer = setTimeout(() => {
      void this.runCycle();
    }, 10_000);
    this.initialTimer.unref();

    this.timer = setInterval(() => {
      void this.runCycle();
    }, this.intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.initialTimer) {
      clearTimeout(this.initialTimer);
      this.initialTimer = null;
    }
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.logger?.info("Stopped Commerce Fulfillment Scheduler");
    }
  }

  async runCycle(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      const now = new Date();

      // 1. Expire stale pending orders
      const expired = await this.database
        .updateTable("orders")
        .set({
          status: "expired",
          updated_at: now,
        })
        .where("status", "in", ["pending", "payment_processing"])
        .where("expires_at", "<", now)
        .returningAll()
        .execute();

      if (expired.length > 0) {
        this.logger?.info({ expiredCount: expired.length }, "Orders expired");
      }

      // 2. Recover stale payments
      const staleCutoff = new Date(Date.now() - 5 * 60 * 1000);
      const maxAgeCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const stalePayments = await this.database
        .selectFrom("payments")
        .selectAll()
        .where("status", "in", ["initiated", "processing"])
        .where("updated_at", "<", staleCutoff)
        .where("created_at", ">", maxAgeCutoff)
        .limit(20)
        .execute();

      for (const payment of stalePayments) {
        try {
          const gatewayOrder = await this.paymentGateway.fetchOrder(
            payment.gateway_order_id,
          );

          if (gatewayOrder.status === "paid") {
            const orderPayments = await this.paymentGateway.fetchOrderPayments(
              payment.gateway_order_id,
            );
            const captured = orderPayments.find(
              (p: GatewayPaymentDetails) => p.status === "captured",
            );
            if (captured) {
              await this.paymentWorker.finalizePayment(
                payment.id,
                captured.gatewayPaymentId,
                captured.method ? { method: captured.method } : undefined,
              );
              this.logger?.info(
                { paymentId: payment.id },
                "Recovered stale captured payment",
              );
            }
          }
        } catch (err) {
          this.logger?.error(
            { err, paymentId: payment.id },
            "Error recovering stale payment",
          );
        }
      }
    } catch (err) {
      this.logger?.error(
        { err },
        "Error occurred during fulfillment scheduler cycle",
      );
    } finally {
      this.isRunning = false;
    }
  }
}
