import type { OrderStatus, OrderItemType } from "@veolms/database";
import type { Executor } from "../shared/repository.types.ts";

export async function findOrderById(database: Executor, orderId: string) {
  return await database
    .selectFrom("orders")
    .selectAll()
    .where("id", "=", orderId)
    .executeTakeFirst();
}

/**
 * Same as findOrderById, but takes a `SELECT ... FOR UPDATE` row lock. Must
 * be called inside a transaction. Used to serialize concurrent operations
 * against the same order — e.g. refund.service.ts's processRefund, so two
 * concurrent refund requests for the same order can't both read the same
 * "already refunded" total and both pass validation before either writes.
 * The second caller's query blocks here until the first transaction commits
 * or rolls back, then sees the first's effect on re-read.
 */
export async function findOrderByIdForUpdate(database: Executor, orderId: string) {
  return await database
    .selectFrom("orders")
    .selectAll()
    .where("id", "=", orderId)
    .forUpdate()
    .executeTakeFirst();
}

export async function findOrderByOrderNumber(
  database: Executor,
  orderNumber: string,
) {
  return await database
    .selectFrom("orders")
    .selectAll()
    .where("order_number", "=", orderNumber)
    .executeTakeFirst();
}

export async function findOrderByIdempotencyKey(
  database: Executor,
  idempotencyKey: string,
) {
  return await database
    .selectFrom("orders")
    .selectAll()
    .where("idempotency_key", "=", idempotencyKey)
    .executeTakeFirst();
}

export async function listOrdersByUserId(
  database: Executor,
  userId: string,
) {
  return await database
    .selectFrom("orders")
    .selectAll()
    .where("user_id", "=", userId)
    .orderBy("created_at", "desc")
    .execute();
}

export async function listOrderItems(database: Executor, orderId: string) {
  return await database
    .selectFrom("order_items")
    .selectAll()
    .where("order_id", "=", orderId)
    .orderBy("created_at", "asc")
    .execute();
}

export async function listOrderItemsByOrderIds(
  database: Executor,
  orderIds: string[],
) {
  if (orderIds.length === 0) return [];
  return await database
    .selectFrom("order_items")
    .selectAll()
    .where("order_id", "in", orderIds)
    .orderBy("created_at", "asc")
    .execute();
}

export async function insertOrder(
  database: Executor,
  values: {
    id: string;
    order_number: string;
    user_id: string;
    status: OrderStatus;
    currency: string;
    subtotal_amount: number;
    discount_amount?: number;
    tax_amount?: number;
    total_amount: number;
    coupon_id?: string | null;
    idempotency_key?: string | null;
    expires_at: Date;
    paid_at?: Date | null;
    created_at?: Date;
    updated_at?: Date;
  },
) {
  return await database
    .insertInto("orders")
    .values(values)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function insertOrderItems(
  database: Executor,
  items: Array<{
    id: string;
    order_id: string;
    item_type: OrderItemType;
    course_id?: string | null;
    bundle_id?: string | null;
    title_snapshot: string;
    unit_price: number;
    discount_amount?: number;
    tax_amount?: number;
    final_amount: number;
    created_at?: Date;
  }>,
) {
  if (items.length === 0) return [];
  return await database
    .insertInto("order_items")
    .values(items)
    .returningAll()
    .execute();
}

export async function updateOrderStatus(
  database: Executor,
  orderId: string,
  updates: {
    status: OrderStatus;
    paid_at?: Date | null;
    updated_at?: Date;
  },
) {
  return await database
    .updateTable("orders")
    .set(updates)
    .where("id", "=", orderId)
    .returningAll()
    .executeTakeFirst();
}

/**
 * Optimistically transition order to paid if it hasn't already been settled.
 *
 * Includes "expired" alongside "pending"/"payment_processing": a payment can
 * settle after checkout.service's 1-hour expiry window has already flipped
 * the order to "expired" (delayed webhook, slow gateway checkout). Without
 * this, a real successful payment leaves `orders.status` stuck at "expired"
 * forever even though access/enrollment/etc. all proceed — and the order
 * becomes unrefundable via the admin API, which only allows refunds from
 * "paid"/"partially_refunded". "cancelled", "paid", "partially_refunded", and
 * "refunded" are intentionally excluded — those are settled outcomes a late
 * payment claim must not silently overwrite.
 */
export async function markOrderPaidIfPending(
  database: Executor,
  orderId: string,
  paidAt: Date,
) {
  return await database
    .updateTable("orders")
    .set({
      status: "paid",
      paid_at: paidAt,
      updated_at: new Date(),
    })
    .where("id", "=", orderId)
    .where("status", "in", ["pending", "payment_processing", "expired"])
    .returningAll()
    .executeTakeFirst();
}
