import type { FastifyBaseLogger } from "fastify";
import { sql, type Kysely } from "kysely";
import type { Database } from "@veolms/database";
import type { PaymentGateway } from "@veolms/contracts";
import { createOrderExpirationWorker } from "./order-expiration.worker.ts";
import { createPaymentRecoveryWorker } from "./payment-recovery.worker.ts";
import { createRefundReconciliationWorker } from "./refund-reconciliation.worker.ts";
import * as webhookRepo from "../webhooks/webhook.repository.ts";

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
  private readonly orderExpirationWorker: ReturnType<
    typeof createOrderExpirationWorker
  >;
  private readonly paymentRecoveryWorker: ReturnType<
    typeof createPaymentRecoveryWorker
  >;
  private readonly refundReconciliationWorker: ReturnType<
    typeof createRefundReconciliationWorker
  >;
  private readonly intervalMs: number;
  private readonly database: Kysely<Database>;
  private timer: NodeJS.Timeout | null = null;
  private initialTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private activeCycle: Promise<void> | null = null;

  /** Processed webhook events older than this are deleted each cycle. */
  private static readonly WEBHOOK_RETENTION_DAYS = 30;

  constructor(options: FulfillmentSchedulerOptions) {
    this.logger = options.logger;
    this.database = options.database;
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

    this.logger?.info(
      "Starting Commerce Fulfillment Scheduler (Order Expiration, Payment Recovery, Refund Reconciliation)",
    );

    // Run first cycle 10 seconds after server startup to avoid startup congestion
    this.initialTimer = setTimeout(() => {
      void this.runCycle();
    }, 10_000);
    this.initialTimer.unref();

    this.timer = setInterval(() => {
      void this.runCycle();
    }, this.intervalMs);
    this.timer.unref();
  }

  async stop(): Promise<void> {
    if (this.initialTimer) {
      clearTimeout(this.initialTimer);
      this.initialTimer = null;
    }
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.logger?.info("Stopped Commerce Fulfillment Scheduler");
    }

    // The API destroys its shared Kysely instance right after the onClose
    // hooks run — wait for an in-flight cycle so its workers cannot hit the
    // destroyed pool mid-query during a restart (the payment event queue's
    // stop() already does the same).
    await this.activeCycle;
  }

  async runCycle(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    const cycle = this.executeCycle();
    this.activeCycle = cycle;

    try {
      await cycle;
    } catch (error) {
      // Both callers are timers that discard this promise (void runCycle()).
      // A failure to even reach the workers — e.g. the pool cannot hand out
      // a connection for the advisory lock — would otherwise surface as an
      // unhandled rejection and take the API process down.
      this.logger?.error(
        { err: error, job: "commerce-fulfillment-scheduler" },
        "Commerce fulfillment cycle failed",
      );
    } finally {
      if (this.activeCycle === cycle) this.activeCycle = null;
      this.isRunning = false;
    }
  }

  private async executeCycle(): Promise<void> {
    // Cross-replica leader gate: every API replica starts this scheduler,
    // and without a lock each replica duplicated every gateway call and
    // raced the conditional DB writes each cycle. pg_try_advisory_lock is
    // held on ONE reserved connection for the duration of the cycle (the
    // workers themselves keep using the shared pool); a replica that
    // doesn't get the lock simply skips its tick — the lock holder is
    // doing the same work.
    await this.database.connection().execute(async (connection) => {
      const lock = await sql<{ locked: boolean }>`
        select pg_try_advisory_lock(
          hashtext('veolms:commerce-fulfillment-scheduler')
        ) as locked
      `.execute(connection);
      if (!lock.rows[0]?.locked) {
        this.logger?.debug(
          "Commerce fulfillment cycle skipped: another instance holds the scheduler lock",
        );
        return;
      }

      try {
        await this.runWorkers();
      } finally {
        await sql`
          select pg_advisory_unlock(
            hashtext('veolms:commerce-fulfillment-scheduler')
          )
        `.execute(connection);
      }
    });
  }

  private async runWorkers(): Promise<void> {
    // These three operate on disjoint tables (orders, payments, refunds)
    // with no dependency between them, so they run concurrently instead
    // of one after another — a tick's cost is the max of the three
    // instead of their sum, and (combined with the batch/concurrency caps
    // in payment-recovery.worker.ts / refund-reconciliation.worker.ts) one
    // worker's backlog no longer delays the other two.
    //
    // allSettled rather than Promise.all: each worker already isolates
    // per-item failures internally, but if one worker's own query throws
    // (e.g. a DB blip), the other two should still run to completion and
    // get logged as their own successes — not get short-circuited or have
    // their outcome hidden behind whichever error happened to reject
    // first.
    const results = await Promise.allSettled([
      this.orderExpirationWorker.expireStaleOrders(),
      this.paymentRecoveryWorker.recoverStalePayments(),
      this.refundReconciliationWorker.reconcileStaleRefunds(),
      // Retention: processed webhook events are otherwise kept forever,
      // degrading the (partial-indexed) poll and growing the table without
      // bound. One bounded batch per cycle is enough to keep up.
      webhookRepo.deleteProcessedWebhookEventsOlderThan(
        this.database,
        CommerceFulfillmentScheduler.WEBHOOK_RETENTION_DAYS,
      ),
    ]);

    const workerNames = [
      "order-expiration",
      "payment-recovery",
      "refund-reconciliation",
      "webhook-retention",
    ] as const;
    results.forEach((result, i) => {
      if (result.status === "rejected") {
        this.logger?.error(
          { err: result.reason, worker: workerNames[i] },
          "Error occurred during commerce fulfillment scheduled cycle",
        );
      }
    });
  }
}
