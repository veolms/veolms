import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";
import type { FastifyBaseLogger } from "fastify";
import type { GatewayRefundDetails, PaymentGateway } from "@veolms/contracts";
import * as refundRepo from "../refunds/refund.repository.ts";
import * as orderRepo from "../orders/order.repository.ts";
import { createCourseAccessService } from "../shared/course-access.service.ts";
import { mapWithConcurrency } from "../../../lib/concurrency.ts";

export interface RefundReconciliationWorkerOptions {
  database: Kysely<Database>;
  paymentGateway: PaymentGateway;
  logger?: FastifyBaseLogger;
  /** How old (in minutes) a pending refund must be before reconciliation queries the gateway. Default: 10 */
  staleAfterMinutes?: number;
  /**
   * Max stale refunds processed in one tick. Without this, a backlog of N
   * (gateway outage, traffic spike) makes a single tick's gateway-call count
   * scale with N. Default: 100 — see refund.repository.ts's listStaleRefunds.
   */
  batchSize?: number;
  /**
   * Max gateway calls in flight at once (see mapWithConcurrency). Only the
   * read-only gateway fetch is parallelized — the DB reconciliation writes
   * below stay strictly serial, since two stale refunds against the *same*
   * order racing their "total refunded so far" read-then-write would risk
   * the same cumulative-refund bug fixed elsewhere (see payment.worker.ts's
   * handleRefundSucceeded). Default: 5
   */
  concurrency?: number;
}

export function createRefundReconciliationWorker({
  database,
  paymentGateway,
  logger,
  staleAfterMinutes = 10,
  batchSize = 100,
  concurrency = 5,
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
    const staleRefunds = await refundRepo.listStaleRefunds(database, staleAfterMinutes, batchSize);

    let resolved = 0;
    let skipped = 0;
    let errors = 0;

    // 1. Fetch gateway status for every stale refund concurrently — this is
    //    the actual bottleneck (N sequential network round-trips), not the
    //    DB reconciliation below.
    const fetchResults = await mapWithConcurrency(staleRefunds, concurrency, async (refund) => {
      if (!refund.gateway_refund_id) {
        return { refund, gatewayRefund: null as GatewayRefundDetails | null, error: null as unknown };
      }
      try {
        const gatewayRefund = await paymentGateway.fetchRefund(refund.gateway_refund_id);
        return { refund, gatewayRefund, error: null as unknown };
      } catch (err) {
        return { refund, gatewayRefund: null as GatewayRefundDetails | null, error: err };
      }
    });

    // 2. Apply DB writes strictly serially, same as before parallelizing the
    //    fetch above — only the network calls were parallelized.
    for (const { refund, gatewayRefund, error } of fetchResults) {
      if (error) {
        log?.error({ err: error, refundId: refund.id }, "Error fetching stale refund from gateway");
        errors++;
        continue;
      }

      if (!refund.gateway_refund_id || !gatewayRefund) {
        skipped++;
        continue;
      }

      try {
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
