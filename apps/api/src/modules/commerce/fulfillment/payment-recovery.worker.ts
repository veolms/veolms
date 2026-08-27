import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";
import type { FastifyBaseLogger } from "fastify";
import type { PaymentGateway } from "@veolms/contracts";
import type { AccessService } from "../../access/access.service.ts";
import { createAccessService } from "../../access/access.service.ts";
import { createPaymentReconciliationService } from "../payments/payment-reconciliation.service.ts";

export interface PaymentRecoveryWorkerOptions {
  database: Kysely<Database>;
  paymentGateway: PaymentGateway;
  accessService?: AccessService;
  logger?: FastifyBaseLogger;
  /** Minimum age in minutes before a stale payment is queried against the gateway. Default: 5 */
  staleAfterMinutes?: number;
  /** Maximum age in hours — payments older than this are skipped (likely abandoned). Default: 24 */
  maxAgeHours?: number;
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
}: PaymentRecoveryWorkerOptions) {
  const reconciliation = createPaymentReconciliationService({ database, accessService });

  async function recoverStalePayments(): Promise<{
    recovered: number;
    failed: number;
    skipped: number;
    errors: number;
  }> {
    const log = logger?.child({ job: "payment-recovery-worker" });

    const staleMinuteCutoff = new Date(Date.now() - staleAfterMinutes * 60 * 1000);
    const maxAgeCutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

    // Find payments stuck in initiated/processing within our time window
    const stalePayments = await database
      .selectFrom("payments")
      .selectAll()
      .where("status", "in", ["initiated", "processing"])
      .where("updated_at", "<", staleMinuteCutoff)
      .where("created_at", ">", maxAgeCutoff)
      .orderBy("created_at", "asc")
      .execute();

    log?.info({ count: stalePayments.length }, "Found stale payments for recovery");

    let recovered = 0;
    let failed = 0;
    let skipped = 0;
    let errors = 0;

    for (const payment of stalePayments) {
      try {
        // Query the gateway for current order status
        const gatewayOrder = await paymentGateway.fetchOrder(payment.gateway_order_id);

        if (gatewayOrder.status === "paid") {
          let targetPaymentId = payment.gateway_payment_id;
          let paymentMethod = payment.payment_method;

          // If no gateway_payment_id locally, query Razorpay for payments on this order
          if (!targetPaymentId) {
            const orderPayments = await paymentGateway.fetchOrderPayments(payment.gateway_order_id);
            const capturedPayment = orderPayments.find((p) => p.status === "captured");
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

          if (targetPaymentId) {
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
              recovered++;
            } else {
              log?.info({ paymentId: payment.id }, "Payment already finalized by another path");
              skipped++;
            }
          } else {
            log?.warn(
              { paymentId: payment.id, gatewayOrderId: payment.gateway_order_id },
              "Gateway order is paid but no captured payment found via API; deferring to webhook",
            );
            skipped++;
          }
        } else if (gatewayOrder.status === "created") {
          // Gateway order exists but no payment attempt yet — truly stale/abandoned
          log?.debug({ paymentId: payment.id }, "Gateway order not yet attempted, skipping");
          skipped++;
        } else {
          // 'attempted' — payment was tried but not yet captured; still in-flight
          skipped++;
        }
      } catch (err: any) {
        log?.error({ err, paymentId: payment.id }, "Error recovering stale payment");
        errors++;
      }
    }

    log?.info({ recovered, failed, skipped, errors }, "Payment recovery run complete");
    return { recovered, failed, skipped, errors };
  }

  return { recoverStalePayments };
}
