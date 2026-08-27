import type { FastifyBaseLogger } from "fastify";
import type { Kysely } from "kysely";
import type { Database } from "@veolms/database";
import type { PaymentGateway } from "@veolms/contracts";
import { createOrderExpirationWorker } from "./order-expiration.worker.ts";
import { createPaymentRecoveryWorker } from "./payment-recovery.worker.ts";
import { createRefundReconciliationWorker } from "./refund-reconciliation.worker.ts";

export interface FulfillmentSchedulerOptions {
  database: Kysely<Database>;
  paymentGateway: PaymentGateway;
  logger?: FastifyBaseLogger;
  /** Interval in milliseconds between reconciliation cycles. Default: 5 minutes */
  intervalMs?: number;
}

/**
 * Unified commerce background reconciliation scheduler.
 * Runs order expiration, stale payment recovery, and pending refund reconciliation.
 */
export class CommerceFulfillmentScheduler {
  private readonly logger?: FastifyBaseLogger;
  private readonly orderExpirationWorker: ReturnType<typeof createOrderExpirationWorker>;
  private readonly paymentRecoveryWorker: ReturnType<typeof createPaymentRecoveryWorker>;
  private readonly refundReconciliationWorker: ReturnType<typeof createRefundReconciliationWorker>;
  private readonly intervalMs: number;
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(options: FulfillmentSchedulerOptions) {
    this.logger = options.logger;
    this.intervalMs = options.intervalMs ?? 5 * 60 * 1000; // 5 minutes
    this.orderExpirationWorker = createOrderExpirationWorker({
      database: options.database,
      logger: options.logger,
    });
    this.paymentRecoveryWorker = createPaymentRecoveryWorker({
      database: options.database,
      paymentGateway: options.paymentGateway,
      logger: options.logger,
    });
    this.refundReconciliationWorker = createRefundReconciliationWorker({
      database: options.database,
      paymentGateway: options.paymentGateway,
      logger: options.logger,
    });
  }

  start(): void {
    if (this.timer) return;

    this.logger?.info("Starting Commerce Fulfillment Scheduler (Order Expiration, Payment Recovery, Refund Reconciliation)");

    // Run first cycle 10 seconds after server startup to avoid startup congestion
    const initialTimer = setTimeout(() => {
      void this.runCycle();
    }, 10_000);
    initialTimer.unref();

    this.timer = setInterval(() => {
      void this.runCycle();
    }, this.intervalMs);
    this.timer.unref();
  }

  stop(): void {
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
      // 1. Expire stale orders
      await this.orderExpirationWorker.expireStaleOrders();

      // 2. Reconcile in-flight stale payments against gateway
      await this.paymentRecoveryWorker.recoverStalePayments();

      // 3. Reconcile pending refunds against gateway
      await this.refundReconciliationWorker.reconcileStaleRefunds();
    } catch (err: any) {
      this.logger?.error({ err }, "Error occurred during commerce fulfillment scheduled cycle");
    } finally {
      this.isRunning = false;
    }
  }
}
