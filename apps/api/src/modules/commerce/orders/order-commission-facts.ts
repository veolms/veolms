import type { DatabaseExecutor } from "@veolms/database";
import type { OrderItemType, RefundStatus } from "@veolms/database";

/**
 * What the affiliate program reads about orders and refunds: commerce owns
 * these tables, so the reads live here and the affiliate module calls them
 * (never querying the tables itself). Plain reads, usable inside the
 * payment or refund transaction that called the affiliate code.
 */

export interface CommissionOrderFacts {
  id: string;
  userId: string;
  status: string;
  currency: string;
  totalAmount: number;
  settlementAmount: number | null;
  settlementCurrency: string | null;
  paidAt: Date | null;
}

export interface CommissionOrderItemFacts {
  id: string;
  itemType: OrderItemType;
  /** The course, bundle, workshop or quiz pass the item sells. */
  productId: string | null;
  finalAmount: number;
  taxAmount: number;
}

export async function findOrderForCommission(
  executor: DatabaseExecutor,
  orderId: string,
): Promise<
  { order: CommissionOrderFacts; items: CommissionOrderItemFacts[] } | undefined
> {
  const order = await executor
    .selectFrom("orders")
    .select([
      "id",
      "user_id",
      "status",
      "currency",
      "total_amount",
      "settlement_amount",
      "settlement_currency",
      "paid_at",
    ])
    .where("id", "=", orderId)
    .executeTakeFirst();
  if (!order) return undefined;
  const items = await executor
    .selectFrom("order_items")
    .select([
      "id",
      "item_type",
      "course_id",
      "bundle_id",
      "workshop_id",
      "quiz_pricing_id",
      "final_amount",
      "tax_amount",
    ])
    .where("order_id", "=", orderId)
    .orderBy("created_at")
    .orderBy("id")
    .execute();
  return {
    order: {
      id: order.id,
      userId: order.user_id,
      status: order.status,
      currency: order.currency,
      totalAmount: order.total_amount,
      settlementAmount: order.settlement_amount,
      settlementCurrency: order.settlement_currency,
      paidAt: order.paid_at,
    },
    items: items.map((item) => ({
      id: item.id,
      itemType: item.item_type,
      productId:
        item.course_id ??
        item.bundle_id ??
        item.workshop_id ??
        item.quiz_pricing_id ??
        null,
      finalAmount: item.final_amount,
      taxAmount: item.tax_amount,
    })),
  };
}

export interface CommissionRefundFacts {
  id: string;
  orderId: string;
  /** Set when the refund was for one item; null for the order as a whole. */
  orderItemId: string | null;
  amount: number;
  status: RefundStatus;
}

export async function findRefundForReversal(
  executor: DatabaseExecutor,
  refundId: string,
): Promise<CommissionRefundFacts | undefined> {
  const refund = await executor
    .selectFrom("refunds")
    .select(["id", "order_id", "order_item_id", "amount", "status"])
    .where("id", "=", refundId)
    .executeTakeFirst();
  return refund
    ? {
        id: refund.id,
        orderId: refund.order_id,
        orderItemId: refund.order_item_id,
        amount: refund.amount,
        status: refund.status,
      }
    : undefined;
}

/** Refunds settled since a moment, oldest first (for the daily repair). */
export async function listProcessedRefundsSince(
  executor: DatabaseExecutor,
  since: Date,
  limit: number,
): Promise<{ id: string; orderId: string }[]> {
  const rows = await executor
    .selectFrom("refunds")
    .select(["id", "order_id"])
    .where("status", "=", "processed")
    .where("updated_at", ">=", since)
    .orderBy("updated_at")
    .limit(limit)
    .execute();
  return rows.map((row) => ({ id: row.id, orderId: row.order_id }));
}

/** What the affiliate's history shows of each order line: its title and order number. */
export async function listOrderLineLabels(
  executor: DatabaseExecutor,
  orderItemIds: readonly string[],
): Promise<
  Map<string, { title: string; orderNumber: string; buyerUserId: string }>
> {
  if (orderItemIds.length === 0) return new Map();
  const rows = await executor
    .selectFrom("order_items as i")
    .innerJoin("orders as o", "o.id", "i.order_id")
    .select(["i.id", "i.title_snapshot", "o.order_number", "o.user_id"])
    .where("i.id", "in", [...orderItemIds])
    .execute();
  return new Map(
    rows.map((row) => [
      row.id,
      {
        title: row.title_snapshot,
        orderNumber: row.order_number,
        buyerUserId: row.user_id,
      },
    ]),
  );
}
