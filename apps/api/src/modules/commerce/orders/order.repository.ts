import { sql } from "kysely";
import type { OrderStatus, OrderItemType } from "@veolms/database";
import type { OrderScope, OrderCursorPayload, OrderSortOrder } from "@veolms/contracts";
import type { Executor } from "../shared/repository.types.ts";

export interface ListOrdersOptions {
  cursor?: OrderCursorPayload;
  limit: number;
  search?: string;
  courseId?: string;
  couponId?: string;
  status?: OrderStatus;
  from?: Date;
  to?: Date;
  sortOrder?: OrderSortOrder;
}

export interface OrderStatsFilters {
  courseId?: string;
  couponId?: string;
  status?: OrderStatus;
  from?: Date;
  to?: Date;
}

export interface OrderStatsRow {
  currency: string;
  totalOrders: number;
  uniqueBuyers: number;
  grossPaid: number;
  refundedAmount: number;
}

export async function findOrderById(
  database: Executor,
  orderId: string,
  scope?: OrderScope,
) {
  let query = database
    .selectFrom("orders as o")
    .selectAll("o")
    .where("o.id", "=", orderId);

  if (scope && scope.type === "user") {
    query = query.where("o.user_id", "=", scope.id);
  }

  return await query.executeTakeFirst();
}

export async function listOrders(
  database: Executor,
  scope: OrderScope,
  options: ListOrdersOptions,
) {
  const {
    cursor,
    limit,
    search,
    courseId,
    couponId,
    status,
    from,
    to,
    sortOrder = "desc",
  } = options;

  // `created_at` is timestamptz (microseconds) but the driver hands it back
  // as a JS Date (milliseconds). A cursor built from that Date can't
  // reproduce the row's real position, so the keyset seek would skip or
  // repeat rows sharing a millisecond. `created_at_cursor` carries the exact
  // value as text; it is bound back as `::timestamptz` in the seek below.
  let query = database
    .selectFrom("orders as o")
    .selectAll("o")
    .select(
      sql<string>`to_char(o.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`.as(
        "created_at_cursor",
      ),
    );

  // 1. Enforce Scope Predicate in SQL WHERE clause
  if (scope.type === "user") {
    query = query.where("o.user_id", "=", scope.id);
  }

  // 2. Status filter
  if (status) {
    query = query.where("o.status", "=", status);
  }

  // 3. Date range filters
  if (from) {
    query = query.where("o.created_at", ">=", from);
  }
  if (to) {
    query = query.where("o.created_at", "<=", to);
  }

  // 4. Course ID filter via EXISTS
  if (courseId) {
    query = query.where(
      sql<boolean>`EXISTS (
        SELECT 1 FROM order_items oi
        WHERE oi.order_id = o.id
          AND oi.course_id = ${courseId}::uuid
      )`,
    );
  }

  // 5. Coupon ID filter
  if (couponId) {
    query = query.where("o.coupon_id", "=", couponId);
  }

  // 6. Search filter (order number for students, plus student details for admin)
  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    if (scope.type === "user") {
      query = query.where(sql<boolean>`o.order_number ILIKE ${term}`);
    } else {
      query = query.where(
        sql<boolean>`(
          o.order_number ILIKE ${term}
          OR EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = o.user_id
              AND (
                u.display_name ILIKE ${term}
                OR u.username ILIKE ${term}
                OR u.email ILIKE ${term}
              )
          )
        )`,
      );
    }
  }

  // 7. Cursor seek predicate using row-value comparison: (o.created_at, o.id) < ($time, $id)
  if (cursor) {
    // Bound as text and cast so microsecond precision survives; a JS Date
    // would truncate to milliseconds.
    if (sortOrder === "asc") {
      query = query.where(
        sql<boolean>`(o.created_at, o.id) > (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`,
      );
    } else {
      query = query.where(
        sql<boolean>`(o.created_at, o.id) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`,
      );
    }
  }

  // 8. Order by created_at, id
  if (sortOrder === "asc") {
    query = query.orderBy("o.created_at", "asc").orderBy("o.id", "asc");
  } else {
    query = query.orderBy("o.created_at", "desc").orderBy("o.id", "desc");
  }

  // 9. Limit + 1 for cursor pagination
  query = query.limit(limit + 1);

  return await query.execute();
}

/**
 * Aggregates the cohort of orders matching `filters`, one row per currency
 * (amounts in different currencies can't be summed).
 *
 * Everything is derived from that single cohort: `refundedAmount` is the
 * processed refunds against those same orders, not refunds windowed by their
 * own date. Windowing the two sides independently netted refunds of older
 * orders against newer gross (negative net revenue) and applied the status
 * filter to only one side. Revenue counts by order status alone.
 */
export async function getOrderStatsByCurrency(
  database: Executor,
  scope: OrderScope,
  filters: OrderStatsFilters,
): Promise<OrderStatsRow[]> {
  let query = database
    .selectFrom("orders as o")
    .select([
      "o.currency",
      sql<number>`count(o.id)::int`.as("total_orders"),
      sql<number>`count(distinct o.user_id)::int`.as("unique_buyers"),
      sql<number>`coalesce(sum(case when o.status in ('paid', 'partially_refunded', 'refunded') then o.total_amount else 0 end), 0)::bigint`.as(
        "gross_paid",
      ),
      sql<number>`coalesce(sum((
        select coalesce(sum(r.amount), 0)
        from refunds r
        where r.order_id = o.id and r.status = 'processed'
      )), 0)::bigint`.as("refunded_amount"),
    ])
    .groupBy("o.currency")
    .orderBy("o.currency");

  if (scope.type === "user") {
    query = query.where("o.user_id", "=", scope.id);
  }
  if (filters.status) {
    query = query.where("o.status", "=", filters.status);
  }
  if (filters.from) {
    query = query.where("o.created_at", ">=", filters.from);
  }
  if (filters.to) {
    query = query.where("o.created_at", "<=", filters.to);
  }
  if (filters.courseId) {
    query = query.where(
      sql<boolean>`EXISTS (
        SELECT 1 FROM order_items oi
        WHERE oi.order_id = o.id
          AND oi.course_id = ${filters.courseId}::uuid
      )`,
    );
  }
  if (filters.couponId) {
    query = query.where("o.coupon_id", "=", filters.couponId);
  }

  const rows = await query.execute();
  return rows.map((row) => ({
    currency: row.currency,
    totalOrders: Number(row.total_orders),
    uniqueBuyers: Number(row.unique_buyers),
    grossPaid: Number(row.gross_paid),
    refundedAmount: Number(row.refunded_amount),
  }));
}

/**
 * Same as findOrderById, but takes a `SELECT ... FOR UPDATE` row lock. Must
 * be called inside a transaction.
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

export async function listOrderItems(database: Executor, orderId: string) {
  return await database
    .selectFrom("order_items")
    .selectAll()
    .where("order_id", "=", orderId)
    .orderBy("created_at", "asc")
    .execute();
}

export async function findOrderItemById(database: Executor, orderItemId: string) {
  return await database
    .selectFrom("order_items")
    .selectAll()
    .where("id", "=", orderItemId)
    .executeTakeFirst();
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

// Admin batch loading helpers
export async function listUsersByIds(database: Executor, userIds: string[]) {
  if (userIds.length === 0) return [];
  return await database
    .selectFrom("users")
    .select(["id", "display_name", "username", "email"])
    .where("id", "in", userIds)
    .execute();
}

export async function listPaymentsByOrderIds(
  database: Executor,
  orderIds: string[],
) {
  if (orderIds.length === 0) return [];
  // Ranked so the payment that represents the order comes first: the settled
  // one, then any retry attempts, newest first. Callers take the first row
  // per order, which keeps list and detail views in agreement.
  return await database
    .selectFrom("payments")
    .selectAll()
    .where("order_id", "in", orderIds)
    .orderBy("order_id")
    .orderBy(
      sql`case status when 'captured' then 0 when 'refunded' then 1 when 'processing' then 2 when 'initiated' then 3 else 4 end`,
    )
    .orderBy("created_at", "desc")
    .orderBy("id", "desc")
    .execute();
}

export async function listCouponsByIds(
  database: Executor,
  couponIds: string[],
) {
  if (couponIds.length === 0) return [];
  return await database
    .selectFrom("coupons")
    .selectAll()
    .where("id", "in", couponIds)
    .execute();
}

export async function listRefundsByOrderIds(
  database: Executor,
  orderIds: string[],
) {
  if (orderIds.length === 0) return [];
  return await database
    .selectFrom("refunds")
    .selectAll()
    .where("order_id", "in", orderIds)
    .orderBy("created_at", "desc")
    .execute();
}
