import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";
import type { FastifyBaseLogger } from "fastify";
import type { PaymentGateway } from "@veolms/contracts";
import type { AccessService } from "../../access/access.service.ts";
import { createAccessService } from "../../access/access.service.ts";
import { createPaymentReconciliationService } from "../payments/payment-reconciliation.service.ts";
import * as paymentRepo from "../payments/payment.repository.ts";
import { mapWithConcurrency } from "../../../lib/concurrency.ts";

export interface PaymentRecoveryWorkerOptions {
  database: Kysely<Database>;
  paymentGateway: PaymentGateway;
  accessService?: AccessService;
  logger?: FastifyBaseLogger;
  /** Minimum age in minutes before a stale payment is queried against the gateway. Default: 5 */
  staleAfterMinutes?: number;
  /**
   * Age in hours after which an unresolved payment gets one final gateway
   * check and is then closed as abandoned. Default: 24
   */
  maxAgeHours?: number;
  /**
   * Max stale payments processed in one tick. Without this, a backlog of N
   * (gateway outage, traffic spike) makes a single tick's gateway-call count
   * scale with N. Default: 50
   */
  batchSize?: number;
  /**
   * Max gateway calls in flight at once (see mapWithConcurrency). Default: 5
   */
  concurrency?: number;
}

/**
 * Recovery worker that reconciles stale in-flight payments against the gateway.
 *
 * Run on a schedule (e.g. every 5 minutes). Protects against:
 *   - Webhook server downtime during payment capture
 *   - Client never calling /payments/verify after a successful capture
 *
 * Uses the shared PaymentReconciliationService so fulfillment is always
 * exactly-once, even if recovery and webhook/verify overlap.
 */
export function createPaymentRecoveryWorker({
  database,
  paymentGateway,
  accessService = createAccessService(),
  logger,
  staleAfterMinutes = 5,
  maxAgeHours = 24,
  batchSize = 50,
  concurrency = 5,
}: PaymentRecoveryWorkerOptions) {
  const reconciliation = createPaymentReconciliationService({
    database,
    accessService,
  });

  async function recoverStalePayments(): Promise<{
    recovered: number;
    failed: number;
    skipped: number;
    errors: number;
  }> {
    const log = logger?.child({ job: "payment-recovery-worker" });

    const staleMinuteCutoff = new Date(
      Date.now() - staleAfterMinutes * 60 * 1000,
    );
    const maxAgeCutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

    let recovered = 0;
    let failed = 0;
    let skipped = 0;
    let errors = 0;

    type StalePayment = Awaited<ReturnType<typeof listRecent>>[number];

    /**
     * Asks the gateway about one payment and fulfils it if the money was
     * captured. "open" means nothing was captured (yet).
     */
    async function reconcile(
      payment: StalePayment,
    ): Promise<"recovered" | "already-final" | "open"> {
      const gatewayOrder = await paymentGateway.fetchOrder(
        payment.gateway_order_id,
      );
      if (gatewayOrder.status !== "paid") return "open";

      let targetPaymentId = payment.gateway_payment_id;
      let paymentMethod = payment.payment_method;

      // If no gateway_payment_id locally, query Razorpay for payments on this order
      if (!targetPaymentId) {
        const orderPayments = await paymentGateway.fetchOrderPayments(
          payment.gateway_order_id,
        );
        const capturedPayment = orderPayments.find(
          (p) => p.status === "captured",
        );
        if (capturedPayment) {
          targetPaymentId = capturedPayment.gatewayPaymentId;
          paymentMethod = capturedPayment.method
            ? {
                method: capturedPayment.method,
                bank: capturedPayment.bank,
                wallet: capturedPayment.wallet,
                vpa: capturedPayment.vpa,
                cardLast4: capturedPayment.cardLast4,
              }
            : paymentMethod;
        }
      }

      if (!targetPaymentId) {
        log?.warn(
          {
            paymentId: payment.id,
            gatewayOrderId: payment.gateway_order_id,
          },
          "Gateway order is paid but no captured payment found via API; deferring to webhook",
        );
        return "open";
      }

      const result = await reconciliation.finalizeSuccessfulPayment({
        paymentId: payment.id,
        gatewayPaymentId: targetPaymentId,
        paymentMethod,
      });

      if (result.outcome === "finalized") {
        log?.info(
          { paymentId: payment.id, orderId: result.orderId },
          "Payment recovered and fulfilled via gateway order verification",
        );
        return "recovered";
      }
      log?.info(
        { paymentId: payment.id },
        "Payment already finalized by another path",
      );
      return "already-final";
    }

    // --- 1. Payments still inside the recovery window ----------------------
    //
    // Least-recently-checked first, and every payment that is still open is
    // stamped as checked. The batch used to be "the 50 oldest by created_at"
    // with nothing written for an open payment, so once more than 50
    // abandoned checkouts sat in the window (every dismissed payment modal
    // leaves one for 24 hours) each tick re-read the same 50 and a genuinely
    // captured payment further back was never looked at.
    function listRecent() {
      return database
        .selectFrom("payments")
        .selectAll()
        .where("status", "in", ["initiated", "processing"])
        .where("updated_at", "<", staleMinuteCutoff)
        .where("created_at", ">", maxAgeCutoff)
        .orderBy("updated_at", "asc")
        .limit(batchSize)
        .execute();
    }
    const stalePayments = await listRecent();

    log?.info(
      { count: stalePayments.length },
      "Found stale payments for recovery",
    );

    // Bounded concurrency instead of a fully serial loop: caps how many
    // gateway calls are in flight at once instead of either processing one
    // payment at a time (tick duration scales with backlog size) or firing
    // every call at once (Promise.all — unbounded against the gateway).
    await mapWithConcurrency(stalePayments, concurrency, async (payment) => {
      try {
        const outcome = await reconcile(payment);
        if (outcome === "recovered") {
          recovered++;
          return;
        }
        skipped++;
        if (outcome === "open") {
          // Mark as checked so the next tick moves on to other payments.
          await database
            .updateTable("payments")
            .set({ updated_at: new Date() })
            .where("id", "=", payment.id)
            .where("status", "in", ["initiated", "processing"])
            .execute();
        }
      } catch (err: unknown) {
        log?.error(
          { err, paymentId: payment.id },
          "Error recovering stale payment",
        );
        errors++;
      }
    });

    // --- 2. Payments that have aged out of the window ----------------------
    //
    // These used to fall out of the query above and were never looked at
    // again — a captured-but-unfulfilled payment was dropped silently at 24
    // hours. Each one now gets a final gateway check: fulfilled if the money
    // was captured, otherwise closed as abandoned so it stops being
    // re-examined. A capture that still arrives later is fulfilled by the
    // webhook path, which may claim a failed payment.
    const agedOut = await database
      .selectFrom("payments")
      .selectAll()
      .where("status", "in", ["initiated", "processing"])
      .where("created_at", "<=", maxAgeCutoff)
      .orderBy("created_at", "asc")
      .limit(batchSize)
      .execute();

    await mapWithConcurrency(agedOut, concurrency, async (payment) => {
      try {
        const outcome = await reconcile(payment);
        if (outcome === "recovered") {
          recovered++;
          return;
        }
        if (outcome === "already-final") {
          skipped++;
          return;
        }
        const closed = await paymentRepo.transitionPaymentStatus(
          database,
          payment.id,
          "failed",
          ["initiated", "processing"],
          {
            error_code: "ABANDONED",
            error_description: `No captured payment after ${maxAgeHours} hours.`,
          },
        );
        if (closed) failed++;
        else skipped++;
      } catch (err: unknown) {
        // Left in-flight on purpose: the final check is retried next tick
        // rather than closing a payment whose gateway state is unknown.
        log?.error(
          { err, paymentId: payment.id },
          "Error on the final check of an aged-out payment",
        );
        errors++;
      }
    });

    log?.info(
      { recovered, failed, skipped, errors },
      "Payment recovery run complete",
    );
    return { recovered, failed, skipped, errors };
  }

  return { recoverStalePayments };
}
