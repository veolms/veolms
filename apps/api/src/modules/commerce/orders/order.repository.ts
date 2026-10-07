import { sql } from "kysely";
import type { OrderStatus, OrderItemType } from "@veolms/database";
import type {
  OrderScope,
  OrderCursorPayload,
  OrderSortOrder,
} from "@veolms/contracts";
import type { Executor } from "../shared/repository.types.ts";
import { toMinorUnits } from "../shared/currency.ts";

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
  courseId?: string | string[];
  couponId?: string;
  status?: OrderStatus;
  from?: Date;
  to?: Date;
  /** Optional half-open upper bound used by dashboard period comparisons. */
  toExclusive?: Date;
}

export interface OrderStatsRow {
  currency: string;
  /** Successful orders only (`paid` + `partially_refunded`). */
  totalOrders: number;
  uniqueBuyers: number;
  /** Gross of successful orders only (excludes fully refunded / cancelled / failed). */
  grossPaid: number;
  totalEarnings: number;
  /** All processed refunds (Refunded Amount card). */
  refundedAmount: number;
  /** Processed refunds against successful orders only (for Net Revenue). */
  refundedAgainstPaid: number;
}

export interface RevenueTrendFilters {
  courseId?: string | string[];
  from?: Date;
  to?: Date;
  /** Optional half-open upper bound used by dashboard period comparisons. */
  toExclusive?: Date;
  currency: string;
}

export interface RevenueTrendPoint {
  date: string;
  value: number;
}

function courseIdListFilter(courseId: string | string[] | undefined): string[] {
  if (!courseId) return [];
  return Array.isArray(courseId) ? courseId : [courseId];
}

/** Counts of orders by lifecycle bucket — a simple, honestly-derived stand-in
 * for a page-view/checkout funnel, which VeoLMS doesn't currently track. */
export async function getOrderStatusFunnel(
  database: Executor,
  scope: OrderScope,
  filters: {
    from?: Date;
    to?: Date;
    toExclusive?: Date;
    courseId?: string | string[];
  },
): Promise<{ created: number; paid: number; refunded: number }> {
  let query = database
    .selectFrom("orders as o")
    .select([
      sql<number>`count(*)::int`.as("created"),
      sql<number>`count(*) filter (where o.status in ('paid','partially_refunded','refunded'))::int`.as(
        "paid",
      ),
      sql<number>`count(*) filter (where o.status in ('partially_refunded','refunded'))::int`.as(
        "refunded",
      ),
    ]);

  if (scope.type === "user") {
    query = query.where("o.user_id", "=", scope.id);
  }
  if (filters.from) {
    query = query.where("o.created_at", ">=", filters.from);
  }
  if (filters.toExclusive) {
    query = query.where("o.created_at", "<", filters.toExclusive);
  } else if (filters.to) {
    query = query.where("o.created_at", "<=", filters.to);
  }
  const courseIds = courseIdListFilter(filters.courseId);
  if (courseIds.length > 0) {
    query = query.where(
      sql<boolean>`EXISTS (
        SELECT 1 FROM order_items oi
        WHERE oi.order_id = o.id
          AND oi.course_id = ANY(${courseIds}::uuid[])
      )`,
    );
  }

  const row = await query.executeTakeFirst();
  return {
    created: Number(row?.created ?? 0),
    paid: Number(row?.paid ?? 0),
    refunded: Number(row?.refunded ?? 0),
  };
}

/**
 * The order columns the application reads. The GST breakdown columns
 * (`gstin`, `cgst_amount`, `sgst_amount`, `igst_amount`) are left out: nothing
 * reads them.
 */
const orderColumns = [
  "o.id",
  "o.order_number",
  "o.user_id",
  "o.status",
  "o.currency",
  "o.subtotal_amount",
  "o.discount_amount",
  "o.tax_amount",
  "o.total_amount",
  "o.after_commission_amount",
  "o.coupon_id",
  "o.idempotency_key",
  "o.expires_at",
  "o.paid_at",
  "o.created_at",
  "o.updated_at",
] as const;

export async function findOrderById(
  database: Executor,
  orderId: string,
  scope?: OrderScope,
) {
  let query = database
    .selectFrom("orders as o")
    .select(orderColumns)
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
    .select([
      "o.id",
      "o.order_number",
      "o.user_id",
      "o.status",
      "o.currency",
      "o.subtotal_amount",
      "o.discount_amount",
      "o.tax_amount",
      "o.total_amount",
      "o.after_commission_amount",
      "o.coupon_id",
      "o.paid_at",
      "o.created_at",
    ])
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
      // Successful / completed only (exclude cancelled, failed, fully refunded).
      sql<number>`count(*) filter (where o.status in ('paid', 'partially_refunded'))::int`.as(
        "total_orders",
      ),
      sql<number>`count(distinct o.user_id) filter (where o.status in ('paid', 'partially_refunded'))::int`.as(
        "unique_buyers",
      ),
      sql<number>`coalesce(sum(case when o.status in ('paid', 'partially_refunded') then o.total_amount else 0 end), 0)::bigint`.as(
        "gross_paid",
      ),
      // Creator earnings: successful only (matches TagMango Total Earnings).
      sql<number>`coalesce(sum(case when o.status in ('paid', 'partially_refunded') then coalesce(o.after_commission_amount, 0) else 0 end), 0)::bigint`.as(
        "total_earnings",
      ),
      sql<number>`coalesce(sum((
        select coalesce(sum(r.amount), 0)
        from refunds r
        where r.order_id = o.id and r.status = 'processed'
      )), 0)::bigint`.as("refunded_amount"),
      sql<number>`coalesce(sum(case when o.status in ('paid', 'partially_refunded') then (
        select coalesce(sum(r.amount), 0)
        from refunds r
        where r.order_id = o.id and r.status = 'processed'
      ) else 0 end), 0)::bigint`.as("refunded_against_paid"),
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
  if (filters.toExclusive) {
    query = query.where("o.created_at", "<", filters.toExclusive);
  } else if (filters.to) {
    query = query.where("o.created_at", "<=", filters.to);
  }
  if (filters.courseId) {
    const courseIds = Array.isArray(filters.courseId)
      ? filters.courseId
      : [filters.courseId];
    if (courseIds.length > 0) {
      query = query.where(
        sql<boolean>`EXISTS (
          SELECT 1 FROM order_items oi
          WHERE oi.order_id = o.id
            AND oi.course_id = ANY(${courseIds}::uuid[])
        )`,
      );
    }
  }
  if (filters.couponId) {
    query = query.where("o.coupon_id", "=", filters.couponId);
  }

  const rows = await query.execute();
  return rows.map((row) => ({
    currency: row.currency,
    totalOrders: Number(row.total_orders),
    uniqueBuyers: Number(row.unique_buyers),
    // Every amount in this row is MINOR units. orders.total_amount is stored
    // in major units while refunds and after_commission_amount are minor, so
    // the gross is converted here; subtracting the raw values gave nonsense
    // (a ₹499 order with a ₹100 refund netted to -9501).
    grossPaid: toMinorUnits(Number(row.gross_paid), row.currency),
    totalEarnings: Number(row.total_earnings),
    refundedAmount: Number(row.refunded_amount),
    refundedAgainstPaid: Number(row.refunded_against_paid),
  }));
}

/**
 * Day-bucketed net revenue (gross paid minus processed refunds, same
 * definition as getOrderStatsByCurrency) for a single currency — trend charts
 * plot one currency at a time, so the caller resolves which one first (see
 * order.service.ts's computeOrderStats for that selection logic).
 */
export async function getRevenueTrend(
  database: Executor,
  scope: OrderScope,
  filters: RevenueTrendFilters,
): Promise<RevenueTrendPoint[]> {
  let query = database
    .selectFrom("orders as o")
    .select([
      sql<string>`to_char(date_trunc('day', o.created_at at time zone 'UTC'), 'YYYY-MM-DD')`.as(
        "date",
      ),
      sql<number>`coalesce(sum(case when o.status in ('paid', 'partially_refunded') then o.total_amount else 0 end), 0)::bigint`.as(
        "gross_paid",
      ),
      sql<number>`coalesce(sum(case when o.status in ('paid', 'partially_refunded') then (
        select coalesce(sum(r.amount), 0)
        from refunds r
        where r.order_id = o.id and r.status = 'processed'
      ) else 0 end), 0)::bigint`.as("refunded_amount"),
    ])
    .where("o.currency", "=", filters.currency)
    .groupBy(sql`date_trunc('day', o.created_at at time zone 'UTC')`)
    .orderBy(sql`date_trunc('day', o.created_at at time zone 'UTC')`);

  if (scope.type === "user") {
    query = query.where("o.user_id", "=", scope.id);
  }
  if (filters.from) {
    query = query.where("o.created_at", ">=", filters.from);
  }
  if (filters.toExclusive) {
    query = query.where("o.created_at", "<", filters.toExclusive);
  } else if (filters.to) {
    query = query.where("o.created_at", "<=", filters.to);
  }
  if (filters.courseId) {
    const courseIds = Array.isArray(filters.courseId)
      ? filters.courseId
      : [filters.courseId];
    if (courseIds.length > 0) {
      query = query.where(
        sql<boolean>`EXISTS (
          SELECT 1 FROM order_items oi
          WHERE oi.order_id = o.id
            AND oi.course_id = ANY(${courseIds}::uuid[])
        )`,
      );
    }
  }

  const rows = await query.execute();
  return rows.map((row) => ({
    date: row.date,
    // Minor units: the major-unit gross is converted before the minor-unit
    // refunds are subtracted.
    value:
      toMinorUnits(Number(row.gross_paid), filters.currency) -
      Number(row.refunded_amount),
  }));
}

/**
 * Same as findOrderById, but takes a `SELECT ... FOR UPDATE` row lock. Must
 * be called inside a transaction.
 */
export async function findOrderByIdForUpdate(
  database: Executor,
  orderId: string,
) {
  return await database
    .selectFrom("orders")
    .selectAll()
    .where("id", "=", orderId)
    .forUpdate()
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

/**
 * Unpaid, unexpired orders that carry a coupon. A coupon use is only
 * recorded as a redemption when the order is paid, so until then these
 * orders are what is holding it: they count against the coupon's limits.
 * An order stops counting when it is paid (it becomes a redemption),
 * expires, or is cancelled.
 */
export async function listPendingOrdersUsingCoupon(
  database: Executor,
  input: { couponId: string; userId?: string; now: Date },
) {
  let query = database
    .selectFrom("orders")
    .selectAll()
    .where("coupon_id", "=", input.couponId)
    .where("status", "=", "pending")
    .where("expires_at", ">", input.now);

  if (input.userId) {
    query = query.where("user_id", "=", input.userId);
  }
  return await query.orderBy("created_at", "desc").execute();
}

/** How many orders `listPendingOrdersUsingCoupon` would return. */
export async function countPendingOrdersUsingCoupon(
  database: Executor,
  input: { couponId: string; userId?: string; now: Date },
): Promise<number> {
  let query = database
    .selectFrom("orders")
    .select((eb) => eb.fn.countAll().as("count"))
    .where("coupon_id", "=", input.couponId)
    .where("status", "=", "pending")
    .where("expires_at", ">", input.now);

  if (input.userId) {
    query = query.where("user_id", "=", input.userId);
  }
  const row = await query.executeTakeFirst();
  return Number(row?.count ?? 0);
}

/**
 * Another paid order of the same buyer that still entitles them to a
 * course — bought directly, or inside a bundle — other than the order being
 * refunded. Items that have themselves been refunded do not count.
 *
 * access_grants and enrollments hold ONE row per (user, course), owned by
 * the most recent purchase. So when that owning order is refunded and this
 * returns an order, the row is handed to it instead of being revoked;
 * otherwise a bundle refund took away a course the buyer had also bought on
 * its own.
 */
export async function findOtherPaidOrderCoveringCourse(
  database: Executor,
  input: { userId: string; courseId: string; excludeOrderId: string },
) {
  return await database
    .selectFrom("orders as o")
    .innerJoin("order_items as oi", "oi.order_id", "o.id")
    .select(["o.id as order_id", "oi.item_type"])
    .where("o.user_id", "=", input.userId)
    .where("o.id", "!=", input.excludeOrderId)
    .where("o.status", "in", ["paid", "partially_refunded"])
    .where((eb) =>
      eb.or([
        eb("oi.course_id", "=", input.courseId),
        eb(
          "oi.bundle_id",
          "in",
          eb
            .selectFrom("course_bundle_items as cbi")
            .select("cbi.bundle_id")
            .where("cbi.course_id", "=", input.courseId),
        ),
      ]),
    )
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom("refunds as r")
            .select("r.id")
            .whereRef("r.order_item_id", "=", "oi.id")
            .where("r.status", "in", ["pending", "processed"]),
        ),
      ),
    )
    .orderBy("o.paid_at", "desc")
    .limit(1)
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

export async function findOrderItemById(
  database: Executor,
  orderItemId: string,
) {
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

/** The item columns an order response carries, for the orders being shown. */
export async function listOrderItemSummariesByOrderIds(
  database: Executor,
  orderIds: string[],
) {
  if (orderIds.length === 0) return [];
  return await database
    .selectFrom("order_items")
    .select(["order_id", "title_snapshot", "course_id"])
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
    after_commission_amount?: number | null;
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
    .select(["id", "display_name", "username", "email", "avatar_data_url"])
    .where("id", "in", userIds)
    .execute();
}

/** The buyer details an invoice prints; a deleted account has none. */
export async function findInvoiceBuyer(database: Executor, userId: string) {
  return await database
    .selectFrom("users")
    .select(["display_name", "username", "email"])
    .where("id", "=", userId)
    .where("is_deleted", "=", false)
    .executeTakeFirst();
}

/**
 * The one payment that represents each order: the settled one if there is
 * one, otherwise the latest attempt. One row per order, so list and detail
 * views agree on which payment they show.
 */
export async function listPaymentsForOrders(
  database: Executor,
  orderIds: string[],
) {
  if (orderIds.length === 0) return [];
  return await database
    .selectFrom("payments")
    .distinctOn("order_id")
    .select([
      "order_id",
      "gateway_provider",
      "gateway_payment_id",
      "payment_method",
    ])
    .where("order_id", "in", orderIds)
    .orderBy("order_id")
    .orderBy(
      sql`case status when 'captured' then 0 when 'refunded' then 1 when 'processing' then 2 when 'initiated' then 3 else 4 end`,
    )
    .orderBy("created_at", "desc")
    .orderBy("id", "desc")
    .execute();
}

export async function listCouponCodesByIds(
  database: Executor,
  couponIds: string[],
) {
  if (couponIds.length === 0) return [];
  return await database
    .selectFrom("coupons")
    .select(["id", "code"])
    .where("id", "in", couponIds)
    .execute();
}

/**
 * Id of the academy this deployment serves. Admin-view requests resolve it on
 * every call, so it reads the one column they use.
 */
export async function findAcademyId(database: Executor) {
  const academy = await database
    .selectFrom("academy")
    .select("id")
    .executeTakeFirst();
  return academy?.id;
}
