import type { RefundStatus } from "@veolms/database";
import type { Executor } from "../shared/repository.types.ts";

export async function findRefundById(database: Executor, refundId: string) {
  return await database
    .selectFrom("refunds")
    .selectAll()
    .where("id", "=", refundId)
    .executeTakeFirst();
}

export async function listRefundsByOrderId(
  database: Executor,
  orderId: string,
) {
  return await database
    .selectFrom("refunds")
    .selectAll()
    .where("order_id", "=", orderId)
    .orderBy("created_at", "desc")
    .execute();
}

export async function insertRefund(
  database: Executor,
  values: {
    id: string;
    order_id: string;
    payment_id: string;
    gateway_refund_id?: string | null;
    amount: number;
    currency: string;
    reason?: string | null;
    status: RefundStatus;
    created_by?: string | null;
    created_at?: Date;
    updated_at?: Date;
  },
) {
  return await database
    .insertInto("refunds")
    .values(values)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function updateRefundStatus(
  database: Executor,
  refundId: string,
  updates: {
    gateway_refund_id?: string | null;
    status: RefundStatus;
    updated_at?: Date;
  },
) {
  return await database
    .updateTable("refunds")
    .set(updates)
    .where("id", "=", refundId)
    .returningAll()
    .executeTakeFirst();
}
