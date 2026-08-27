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

/**
 * Idempotently records a refund confirmed by the gateway.
 * If a refund record with this gateway_refund_id already exists, updates its status.
 * If not, inserts a new record. Returns the upserted row.
 */
export async function upsertRefundByGatewayRefundId(
  database: Executor,
  values: {
    id: string;
    order_id: string;
    payment_id: string;
    gateway_refund_id: string;
    amount: number;
    currency: string;
    reason?: string | null;
    status: RefundStatus;
    updated_at?: Date;
  },
) {
  return await database
    .insertInto("refunds")
    .values(values)
    .onConflict((oc) =>
      oc.column("gateway_refund_id").doUpdateSet({
        status: values.status,
        updated_at: values.updated_at ?? new Date(),
      }),
    )
    .returningAll()
    .executeTakeFirstOrThrow();
}

/**
 * Sums every OTHER refund for an order that counts toward "how much has
 * already been refunded" — `status IN ('processed', 'pending')` — so a
 * caller can compare `thisRefundAmount + sumOtherCountedRefunds(...)`
 * against the payment total to decide full vs. partial. `exclude` lets a
 * caller that already has its own row (or is about to insert/upsert one)
 * avoid double-counting itself, by `id` and/or `gateway_refund_id`.
 *
 * Single shared implementation of a cumulative-refund-total check that used
 * to be reimplemented independently in 3 places (refund.service.ts,
 * fulfillment/payment.worker.ts, fulfillment/refund-reconciliation.worker.ts)
 * with 3 different — and in one case incomplete — filter predicates.
 * refund-reconciliation.worker.ts's old inline version didn't count other
 * `pending` refunds toward the total at all, only `processed` ones, which
 * could under-count the true refunded total whenever more than one refund
 * for the same order was in flight at once — a future correctness fix
 * applied to one copy silently not reaching the other two is exactly the
 * failure mode this consolidation removes.
 */
export async function sumOtherCountedRefunds(
  database: Executor,
  orderId: string,
  exclude?: { refundId?: string; gatewayRefundId?: string | null },
): Promise<number> {
  const existingRefunds = await listRefundsByOrderId(database, orderId);
  return existingRefunds
    .filter((r) => {
      if (exclude?.refundId && r.id === exclude.refundId) return false;
      if (exclude?.gatewayRefundId && r.gateway_refund_id === exclude.gatewayRefundId) return false;
      return r.status === "processed" || r.status === "pending";
    })
    .reduce((sum, r) => sum + r.amount, 0);
}

export async function listStaleRefunds(
  database: Executor,
  olderThanMinutes: number,
  // Bounds how much work one scheduler tick can take on — without this a
  // backlog of N stale refunds (gateway outage, traffic spike) makes a
  // single tick's cost scale with N instead of a fixed batch size.
  limit = 100,
) {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
  return await database
    .selectFrom("refunds")
    .selectAll()
    .where("status", "=", "pending")
    .where("gateway_refund_id", "is not", null)
    .where("created_at", "<", cutoff)
    .orderBy("created_at", "asc")
    .limit(limit)
    .execute();
}

