import type {
  LearnerRefundRequest,
  Refund,
  RefundRequest,
  RefundResult,
} from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { Selectable } from "kysely";

export type RefundRow = Selectable<Database["refunds"]>;
export type RefundRequestRow = Selectable<Database["refund_requests"]>;

/** What issuing a refund answers with. */
export function toRefundResult(refund: Refund): RefundResult {
  return {
    id: refund.id,
    amount: refund.amount,
    currency: refund.currency,
    status: refund.status,
  };
}

/** A refund request as staff reviewing it see it. */
export function toRefundRequestContract(r: RefundRequestRow): RefundRequest {
  return {
    id: r.id,
    orderId: r.order_id,
    userId: r.user_id,
    reason: r.reason,
    status: r.status,
    adminNotes: r.admin_notes,
    resolvedAt: r.resolved_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** A refund request as the learner who filed it sees it: no internal notes. */
export function toLearnerRefundRequest(
  r: RefundRequestRow,
): LearnerRefundRequest {
  return {
    id: r.id,
    orderId: r.order_id,
    reason: r.reason,
    status: r.status,
    resolvedAt: r.resolved_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function toRefundContract(r: RefundRow): Refund {
  return {
    id: r.id,
    orderId: r.order_id,
    orderItemId: r.order_item_id,
    paymentId: r.payment_id,
    gatewayRefundId: r.gateway_refund_id,
    amount: r.amount,
    currency: r.currency,
    reason: r.reason,
    status: r.status,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
