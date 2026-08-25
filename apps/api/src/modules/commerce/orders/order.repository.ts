import type { OrderStatus, OrderItemType } from "@veolms/database";
import type { Executor } from "../shared/repository.types.ts";

export async function findOrderById(database: Executor, orderId: string) {
  return await database
    .selectFrom("orders")
    .selectAll()
    .where("id", "=", orderId)
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
 * Optimistically transition order to paid only if currently in pending/processing.
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
    .where("status", "in", ["pending", "payment_processing"])
    .returningAll()
    .executeTakeFirst();
}
