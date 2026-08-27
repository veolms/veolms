import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";
import type { FastifyBaseLogger } from "fastify";
import type { PaymentGateway } from "@veolms/contracts";
import * as refundRepo from "../refunds/refund.repository.ts";
import * as orderRepo from "../orders/order.repository.ts";
import { createCourseAccessService } from "../shared/course-access.service.ts";

export interface RefundReconciliationWorkerOptions {
  database: Kysely<Database>;
  paymentGateway: PaymentGateway;
  logger?: FastifyBaseLogger;
  /** How old (in minutes) a pending refund must be before reconciliation queries the gateway. Default: 10 */
  staleAfterMinutes?: number;
}

export function createRefundReconciliationWorker({
  database,
  paymentGateway,
  logger,
  staleAfterMinutes = 10,
}: RefundReconciliationWorkerOptions) {
  const courseAccessService = createCourseAccessService();

  /**
   * Polls the gateway for any refunds that have been pending for longer than
   * `staleAfterMinutes`. Updates the database status to match gateway truth.
   * Safe to call repeatedly — each update is conditional on current status.
   */
  async function reconcileStaleRefunds(): Promise<{
    resolved: number;
    skipped: number;
    errors: number;
  }> {
    const log = logger?.child({ job: "refund-reconciliation-worker" });
    const staleRefunds = await refundRepo.listStaleRefunds(database, staleAfterMinutes);

    let resolved = 0;
    let skipped = 0;
    let errors = 0;

    for (const refund of staleRefunds) {
      try {
        if (!refund.gateway_refund_id) {
          skipped++;
          continue;
        }

        const gatewayRefund = await paymentGateway.fetchRefund(refund.gateway_refund_id);

        if (gatewayRefund.status === refund.status) {
          // Already in sync
          skipped++;
          continue;
        }

        if (gatewayRefund.status === "processed") {
          const order = await orderRepo.findOrderById(database, refund.order_id);
          if (!order) {
            skipped++;
            continue;
          }

          const allRefunds = await refundRepo.listRefundsByOrderId(database, refund.order_id);
          const totalProcessed = allRefunds
            .filter((r) => r.status === "processed" || r.id === refund.id)
            .reduce((sum, r) => sum + r.amount, 0);

          await database.transaction().execute(async (trx) => {
            await refundRepo.updateRefundStatus(trx, refund.id, {
              status: "processed",
              updated_at: new Date(),
            });

            // Determine full vs partial based on order total
            const isFullOrderRefund = totalProcessed >= order.total_amount;
            await orderRepo.updateOrderStatus(trx, order.id, {
              status: isFullOrderRefund ? "refunded" : "partially_refunded",
              updated_at: new Date(),
            });

            if (isFullOrderRefund) {
              // Single shared owner of the access_grants + enrollments
              // revoke write — see course-access.service.ts.
              await courseAccessService.revokeAccessForOrder(trx, order);
            }
          });

          log?.info({ refundId: refund.id, orderId: order.id }, "Stale refund reconciled to processed");
          resolved++;
        } else if (gatewayRefund.status === "failed") {
          await refundRepo.updateRefundStatus(database, refund.id, {
            status: "failed",
            updated_at: new Date(),
          });
          log?.warn({ refundId: refund.id }, "Stale refund reconciled to failed");
          resolved++;
        } else {
          // Still pending at gateway — skip
          skipped++;
        }
      } catch (err: any) {
        log?.error({ err, refundId: refund.id }, "Error reconciling stale refund");
        errors++;
      }
    }

    log?.info({ resolved, skipped, errors }, "Refund reconciliation run complete");
    return { resolved, skipped, errors };
  }

  return { reconcileStaleRefunds };
}
