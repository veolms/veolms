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
  /**
   * The request already made, if it still stands. An approved request
   * whose refund then failed at the gateway (the order still paid, no
   * refund under way) does not: the learner may ask again, and that
   * request (`retryRequestId`) is used for it.
   */
  requestStatus: RefundRequestStatus | null;
  retryRequestId: string | null;
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
    const [
      totals,
      quizTotals,
      requests,
      payments,
      liveRefunds,
      transferSentAt,
      credited,
    ] = await Promise.all([
      eligibilityRepo.getOrderWatchTotals(database, userId, ids),
      eligibilityRepo.getOrderQuizTotals(database, userId, ids),
      eligibilityRepo.listRefundRequestStatuses(database, ids),
      paymentRepo.listPaymentProvidersByOrderIds(database, ids),
      eligibilityRepo.listOrdersWithLiveRefund(database, ids),
      eligibilityRepo.listTransferSentAt(database, ids),
      eligibilityRepo.listOrdersCreditedToUpgrade(database, ids),
    ]);
    const totalsByOrder = new Map(totals.map((row) => [row.orderId, row]));
    const quizzesByOrder = new Map(quizTotals.map((row) => [row.orderId, row]));
    const requestByOrder = new Map(requests.map((row) => [row.order_id, row]));
    const manual = new Set(
      payments
        .filter((payment) => isManualTransferProvider(payment.gateway_provider))
        .map((payment) => payment.order_id),
    );

    const at = now();
    for (const order of orders) {
      const totals = totalsByOrder.get(order.id);
      const request = requestByOrder.get(order.id);
      // Only offered orders get here, so the order is still paid.
      const refundFailed =
        request?.status === "approved" && !liveRefunds.has(order.id);
      assessments.set(order.id, {
        orderId: order.id,
        eligibility: evaluateRefundEligibility({
          paidAt: transferSentAt.get(order.id) ?? order.paid_at!,
          // A request made in time, whose refund the gateway then failed,
          // is judged as of when it was made: the gateway's failure must
          // not run it out of the 30 days.
          now: refundFailed ? new Date(request.created_at) : at,
          watchedSeconds: totals?.watchedSeconds ?? 0,
          courseSeconds: totals?.courseSeconds ?? 0,
          creditedToUpgrade: credited.has(order.id),
          quizzesAttempted: quizzesByOrder.get(order.id)?.attempted ?? 0,
          quizzesTotal: quizzesByOrder.get(order.id)?.total ?? 0,
        }),
        requestStatus:
          request && !refundFailed
            ? (request.status as RefundRequestStatus)
            : null,
        retryRequestId: refundFailed ? request.id : null,
        manualTransfer: manual.has(order.id),
      });
    }
    return assessments;
  }

  return { assessOrders };
}
