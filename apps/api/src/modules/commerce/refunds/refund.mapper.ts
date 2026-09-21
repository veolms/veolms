import type { Refund } from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { Selectable } from "kysely";

export type RefundRow = Selectable<Database["refunds"]>;

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
