import type {
  LearnerOrderRefund,
  RefundRequestStatus,
} from "@veolms/contracts";
import type { DatabaseExecutor as Executor } from "@veolms/database";

import * as paymentRepo from "../payments/payment.repository.ts";
import { isManualTransferProvider } from "./outside-refund.ts";
import {
  REFUND_REASON_MESSAGES,
  evaluateRefundEligibility,
  isRefundOffered,
  type RefundEligibility,
} from "./refund-eligibility.ts";
import * as eligibilityRepo from "./refund-eligibility.repository.ts";

export interface OrderRefundAssessment {
  orderId: string;
  eligibility: RefundEligibility;
  requestStatus: RefundRequestStatus | null;
  manualTransfer: boolean;
}

export interface RefundEligibilityService {
  /**
   * The refund option of each of these orders that has one: the user's
   * own paid purchases with something to return. Others are left out.
   */
  assessOrders(
    userId: string,
    orderIds: readonly string[],
  ): Promise<Map<string, OrderRefundAssessment>>;
}

export function toLearnerOrderRefund(
  assessment: OrderRefundAssessment,
): LearnerOrderRefund {
  return {
    eligible: assessment.eligibility.eligible,
    reasons: assessment.eligibility.reasons.map(
      (reason) => REFUND_REASON_MESSAGES[reason],
    ),
    requestStatus: assessment.requestStatus,
    manualTransfer: assessment.manualTransfer,
  };
}

export function createRefundEligibilityService({
  database,
  now = () => new Date(),
}: {
  database: Executor;
  now?: () => Date;
}): RefundEligibilityService {
  async function assessOrders(
    userId: string,
    orderIds: readonly string[],
  ): Promise<Map<string, OrderRefundAssessment>> {
    const assessments = new Map<string, OrderRefundAssessment>();
    const orders = (
      await eligibilityRepo.listOrdersForRefund(database, userId, orderIds)
    ).filter((order) =>
      isRefundOffered({
        status: order.status,
        totalAmount: order.total_amount,
        paidAt: order.paid_at,
      }),
    );
    if (orders.length === 0) return assessments;

    const ids = orders.map((order) => order.id);
    const [totals, requests, payments] = await Promise.all([
      eligibilityRepo.getOrderWatchTotals(database, userId, ids),
      eligibilityRepo.listRefundRequestStatuses(database, ids),
      paymentRepo.listPaymentProvidersByOrderIds(database, ids),
    ]);
    const totalsByOrder = new Map(totals.map((row) => [row.orderId, row]));
    const requestByOrder = new Map(
      requests.map((row) => [row.order_id, row.status as RefundRequestStatus]),
    );
    const manual = new Set(
      payments
        .filter((payment) => isManualTransferProvider(payment.gateway_provider))
        .map((payment) => payment.order_id),
    );

    const at = now();
    for (const order of orders) {
      const totals = totalsByOrder.get(order.id);
      assessments.set(order.id, {
        orderId: order.id,
        eligibility: evaluateRefundEligibility({
          paidAt: order.paid_at!,
          now: at,
          watchedSeconds: totals?.watchedSeconds ?? 0,
          courseSeconds: totals?.courseSeconds ?? 0,
        }),
        requestStatus: requestByOrder.get(order.id) ?? null,
        manualTransfer: manual.has(order.id),
      });
    }
    return assessments;
  }

  return { assessOrders };
}
