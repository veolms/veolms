import { sql, type RawBuilder } from "kysely";
import type { OrderStatus, OrderItemType } from "@veolms/database";
import type {
  OrderScope,
  OrderCursorPayload,
  OrderSortOrder,
} from "@veolms/contracts";
import type { Executor } from "../shared/repository.types.ts";
import { CHECKOUT_HAND_OUT_ATTEMPT_STATUS } from "../shared/open-orders.ts";
import { escapeLikePattern } from "../../../lib/like-pattern.ts";
import { SURPLUS_CAPTURE_ERROR_CODE } from "../payments/surplus-payment.ts";
import { assignInvoiceNumber } from "../invoices/invoice.repository.ts";
import { fuzzyMatchesAny } from "../../../lib/fuzzy-search.ts";

/**
 * Leaves out refunds of an extra payment (payments/extra-payment.ts) where
 * an order's refunds are added up. That money was never part of what the
 * order earned, so its going back is not a refund of the order. For a query
 * that names the refunds table `r`.
 */
const notOfExtraPayment = sql`not exists (
            select 1 from payments xp
            where xp.id = r.payment_id
              and xp.error_code = ${SURPLUS_CAPTURE_ERROR_CODE}
          )`;

export interface ListOrdersOptions {
  cursor?: OrderCursorPayload;
  limit: number;
  search?: string;
  courseId?: string;
  couponId?: string;
  status?: OrderStatus;
  /** Any of these statuses; combined with `status` when both are given. */
  statuses?: readonly OrderStatus[];
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
  /**
   * What the academy has kept from successful orders: an order's stored
   * after-commission amount where it has one, otherwise its total less the
   * refunds processed against it. See getOrderStatsByCurrency.
   */
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
  "o.invoice_number",
  "o.invoice_pdf_key",
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
    statuses,
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
      "o.invoice_number",
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
  if (statuses && statuses.length > 0) {
    query = query.where("o.status", "in", [...statuses]);
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

  // 6. Search filter. A learner's own list: order number, the invoice number
  // a paid order was issued, and what was bought. Staff: order number,
  // invoice number plus student details.
  if (search && search.trim()) {
    // "%" and "_" mean "anything" to ILIKE, so a search for "100%" or "a_b"
    // matched far more than was typed. They are escaped, with the escape
    // character itself (backslash is ILIKE's default escape), as the other
    // search screens do.
    const term = `%${escapeLikePattern(search.trim())}%`;
    if (scope.type === "user") {
      query = query.where(
        sql<boolean>`(
          o.order_number ILIKE ${term}
          OR o.invoice_number ILIKE ${term}
          OR EXISTS (
            SELECT 1 FROM order_items oi
            WHERE oi.order_id = o.id
              AND (
                oi.title_snapshot ILIKE ${term}
                OR ${fuzzyMatchesAny(search, [sql.ref("oi.title_snapshot")])}
                -- Part of a course is shown by the course it opens.
                OR EXISTS (
                  SELECT 1 FROM course_links pcl
                  JOIN courses part ON part.id = pcl.course_id
                  JOIN courses opened ON opened.id = pcl.linked_course_id
                  WHERE pcl.course_id = oi.course_id
                    AND part.unlisted
                    AND pcl.section_ids IS NOT NULL
                    AND (
                      opened.title ILIKE ${term}
                      OR ${fuzzyMatchesAny(search, [sql.ref("opened.title")])}
                    )
                )
              )
          )
        )`,
      );
    } else {
      query = query.where(
        sql<boolean>`(
          o.order_number ILIKE ${term}
          OR o.invoice_number ILIKE ${term}
          OR EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = o.user_id
              AND (
                u.display_name ILIKE ${term}
                OR u.username ILIKE ${term}
                OR u.email ILIKE ${term}
                OR ${fuzzyMatchesAny(search, [
                  sql.ref("u.display_name"),
                  sql.ref("u.username"),
                ])}
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
 * The currency an order counts in for statistics: the one it settled in
 * when it was paid in another (a sale at a course's price for buyers
 * outside India, settled in rupees), its own otherwise.
 */
const settledCurrency = sql<string>`coalesce(o.settlement_currency, o.currency)`;

/**
 * An amount of order `o` in minor units of `settledCurrency`: as it is, or
 * for an order that settled in another currency, at the rate it settled at
 * (its settlement amount against its total).
 */
function inSettledCurrency(amount: RawBuilder<number>) {
  return sql<number>`(case
    when o.settlement_currency is not null and o.total_amount > 0
      then round(${amount}::numeric * o.settlement_amount / o.total_amount)
    else ${amount} end)`;
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
      settledCurrency.as("currency"),
      // Successful / completed only (exclude cancelled, failed, fully refunded).
      sql<number>`count(*) filter (where o.status in ('paid', 'partially_refunded'))::int`.as(
        "total_orders",
      ),
      sql<number>`count(distinct o.user_id) filter (where o.status in ('paid', 'partially_refunded'))::int`.as(
        "unique_buyers",
      ),
      sql<number>`coalesce(sum(case when o.status in ('paid', 'partially_refunded') then ${inSettledCurrency(sql`o.total_amount`)} else 0 end), 0)::bigint`.as(
        "gross_paid",
      ),
      // Creator earnings: successful only (matches TagMango Total Earnings).
      //
      // after_commission_amount is only present on orders that were
      // imported with one; nothing in this codebase writes it, and there is
      // no commission to take off an order placed here. Summing the column
      // alone therefore showed 0 for every order placed here. An order
      // without a stored amount now counts for what was received for it:
      // its total, less the refunds processed against it. The two kinds are
      // summed apart because the stored amount and refunds are minor units
      // and the total is major (converted below, like gross_paid).
      sql<number>`coalesce(sum(case when o.status in ('paid', 'partially_refunded') then o.after_commission_amount else 0 end), 0)::bigint`.as(
        "stored_earnings",
      ),
      sql<number>`coalesce(sum(case when o.status in ('paid', 'partially_refunded') and o.after_commission_amount is null then ${inSettledCurrency(sql`o.total_amount`)} else 0 end), 0)::bigint`.as(
        "unstored_gross",
      ),
      sql<number>`coalesce(sum(case when o.status in ('paid', 'partially_refunded') and o.after_commission_amount is null then ${inSettledCurrency(sql`(
        select coalesce(sum(r.amount), 0)
        from refunds r
        where r.order_id = o.id and r.status = 'processed'
          and ${notOfExtraPayment}
      )`)} else 0 end), 0)::bigint`.as("unstored_refunded"),
      sql<number>`coalesce(sum(${inSettledCurrency(sql`(
        select coalesce(sum(r.amount), 0)
        from refunds r
        where r.order_id = o.id and r.status = 'processed'
          and ${notOfExtraPayment}
      )`)}), 0)::bigint`.as("refunded_amount"),
      sql<number>`coalesce(sum(case when o.status in ('paid', 'partially_refunded') then ${inSettledCurrency(sql`(
        select coalesce(sum(r.amount), 0)
        from refunds r
        where r.order_id = o.id and r.status = 'processed'
          and ${notOfExtraPayment}
      )`)} else 0 end), 0)::bigint`.as("refunded_against_paid"),
    ])
    .groupBy(settledCurrency)
    .orderBy(settledCurrency);

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
    // Every amount in this row is minor units, as stored.
    grossPaid: Number(row.gross_paid),
    // Never below zero: refunds cannot exceed what an order was paid, and
    // the response does not allow a negative figure.
    totalEarnings:
      Number(row.stored_earnings) +
      Math.max(0, Number(row.unstored_gross) - Number(row.unstored_refunded)),
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
      sql<number>`coalesce(sum(case when o.status in ('paid', 'partially_refunded') then ${inSettledCurrency(sql`o.total_amount`)} else 0 end), 0)::bigint`.as(
        "gross_paid",
      ),
      sql<number>`coalesce(sum(case when o.status in ('paid', 'partially_refunded') then ${inSettledCurrency(sql`(
        select coalesce(sum(r.amount), 0)
        from refunds r
        where r.order_id = o.id and r.status = 'processed'
          and ${notOfExtraPayment}
      )`)} else 0 end), 0)::bigint`.as("refunded_amount"),
    ])
    .where(settledCurrency, "=", filters.currency)
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
    // Minor units, like the refunds subtracted from it.
    value: Number(row.gross_paid) - Number(row.refunded_amount),
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
 * Serializes one buyer's checkouts for the rest of the transaction, so two
 * requests arriving together cannot both find no open order and each create
 * one.
 */
export async function lockBuyerCheckout(
  transaction: Executor,
  userId: string,
): Promise<void> {
  await sql`select pg_advisory_xact_lock(hashtext(${`veolms:checkout:${userId}`}))`.execute(
    transaction,
  );
}

/**
 * A buyer's orders that a payment may still arrive for, newest first:
 *
 *  - unpaid and not past their deadline;
 *  - unpaid or expired, with a bank transfer reported since
 *    `manualPaymentSince` and not yet answered by staff (verifying it pays
 *    the order even after it expired). An older report still waits for
 *    staff but no longer counts here: the buyer may pay another way;
 *  - unpaid or expired, whose gateway order was handed to the buyer since
 *    `handedOutSince`, so a payment window for it may still be open.
 *
 * `checkout_handed_out_at` is the last time the gateway order was returned
 * to the buyer: every hand-out records a payment attempt. Attempts that
 * record a failed or captured payment are not hand-outs.
 */
export async function listOrdersAwaitingPayment(
  database: Executor,
  input: {
    userId: string;
    now: Date;
    handedOutSince: Date;
    manualPaymentSince: Date;
  },
) {
  return await database
    .selectFrom("orders as o")
    .selectAll("o")
    .select((eb) => [
      eb
        .selectFrom("payment_attempts as a")
        .innerJoin("payments as p", "p.id", "a.payment_id")
        .select((sub) => sub.fn.max("a.created_at").as("at"))
        .whereRef("p.order_id", "=", "o.id")
        .where("p.gateway_provider", "not in", ["free", "manual"])
        .where("a.status", "=", CHECKOUT_HAND_OUT_ATTEMPT_STATUS)
        .as("checkout_handed_out_at"),
      eb
        .exists(
          eb
            .selectFrom("manual_payment_requests as m")
            .select("m.id")
            .whereRef("m.order_id", "=", "o.id")
            .where("m.status", "=", "pending")
            .where("m.created_at", ">", input.manualPaymentSince),
        )
        .as("manual_payment_pending"),
    ])
    .where("o.user_id", "=", input.userId)
    .where("o.status", "in", ["pending", "payment_processing", "expired"])
    .where((eb) =>
      eb.or([
        eb.and([
          eb("o.status", "=", "pending"),
          eb("o.expires_at", ">", input.now),
        ]),
        eb.exists(
          eb
            .selectFrom("manual_payment_requests as m")
            .select("m.id")
            .whereRef("m.order_id", "=", "o.id")
            .where("m.status", "=", "pending")
            .where("m.created_at", ">", input.manualPaymentSince),
        ),
        eb.exists(
          eb
            .selectFrom("payment_attempts as a")
            .innerJoin("payments as p", "p.id", "a.payment_id")
            .select("a.id")
            .whereRef("p.order_id", "=", "o.id")
            .where("p.gateway_provider", "not in", ["free", "manual"])
            .where("a.status", "=", CHECKOUT_HAND_OUT_ATTEMPT_STATUS)
            .where("a.created_at", ">", input.handedOutSince),
        ),
      ]),
    )
    .orderBy("o.created_at", "desc")
    .execute();
}

/**
 * How many unpaid, unexpired orders carry a coupon. A coupon use is only
 * recorded as a redemption when the order is paid, so until then these
 * orders are what is holding it: they count against the coupon's limits.
 * An order stops counting when it is paid (it becomes a redemption),
 * expires, or is cancelled.
 */
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
 * What an item entitles the buyer to is what it granted when the order was
 * fulfilled (`order_item_courses`), not what its bundle holds today: a
 * bundle edited since may have gained courses this buyer never got through
 * it, and lost ones they did. Only an item with nothing recorded (a bundle
 * order paid before that record was kept) is read from the item itself and
 * from the bundle as it is now.
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
    .where((eb) => {
      const recorded = eb
        .selectFrom("order_item_courses as oic")
        .select("oic.id")
        .whereRef("oic.order_item_id", "=", "oi.id");
      return eb.or([
        eb.exists(recorded.where("oic.course_id", "=", input.courseId)),
        eb.and([
          eb.not(eb.exists(recorded)),
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
        ]),
      ]);
    })
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
    .innerJoin("orders", "orders.id", "order_items.order_id")
    .leftJoin("courses", "courses.id", "order_items.course_id")
    // An unlisted course has no page of its own: the course it unlocks (its
    // first link) is the one to open, and the one it is named by. A link
    // that names sections sells part of that course (a partial access).
    .leftJoinLateral(
      (eb) =>
        eb
          .selectFrom("course_links")
          .innerJoin(
            "courses as linked",
            "linked.id",
            "course_links.linked_course_id",
          )
          .select([
            "course_links.linked_course_id",
            "linked.title as linked_title",
            sql<number | null>`cardinality(course_links.section_ids)`.as(
              "open_sections",
            ),
            (inner) =>
              inner
                .selectFrom("course_sections")
                .select(sql<number>`count(*)::int`.as("n"))
                .whereRef(
                  "course_sections.course_id",
                  "=",
                  "course_links.linked_course_id",
                )
                .where("course_sections.deleted_at", "is", null)
                .as("total_sections"),
          ])
          .whereRef("course_links.course_id", "=", "order_items.course_id")
          .where("courses.unlisted", "=", true)
          .where("linked.deleted_at", "is", null)
          .orderBy("course_links.position", "asc")
          .orderBy("course_links.created_at", "asc")
          .limit(1)
          .as("opens"),
      (join) => join.onTrue(),
    )
    .select([
      "order_items.id",
      "order_items.order_id",
      "order_items.title_snapshot",
      "order_items.course_id",
      "courses.title as course_title",
      "opens.linked_course_id as opens_course_id",
      "opens.linked_title as opens_course_title",
      "opens.open_sections",
      "opens.total_sections",
    ])
    // A course its buyer had already paid for part of: the rest of it, an
    // upgrade (priced as one, see pricing's `upgradeCredit`).
    .select((eb) =>
      eb
        .exists(
          eb
            .selectFrom("order_items as part_items")
            .innerJoin(
              "orders as part_orders",
              "part_orders.id",
              "part_items.order_id",
            )
            .innerJoin(
              "courses as part_courses",
              "part_courses.id",
              "part_items.course_id",
            )
            .innerJoin(
              "course_links as part_links",
              "part_links.course_id",
              "part_courses.id",
            )
            .select(sql<number>`1`.as("one"))
            .whereRef(
              "part_links.linked_course_id",
              "=",
              "order_items.course_id",
            )
            .whereRef("part_orders.user_id", "=", "orders.user_id")
            .whereRef("part_orders.paid_at", "<", "orders.created_at")
            .where("part_courses.unlisted", "=", true)
            .where("part_links.section_ids", "is not", null),
        )
        .as("completes_part"),
    )
    .where("order_items.order_id", "in", orderIds)
    .orderBy("order_items.created_at", "asc")
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

/**
 * Closes a no-cost order the learner has left. A cancelled order no longer
 * counts as one that still covers its courses (see
 * findOtherPaidOrderCoveringCourse), and it gives up its idempotency key so
 * that enrolling again creates a new order instead of replaying this one.
 */
export async function cancelFreeOrder(database: Executor, orderId: string) {
  return await database
    .updateTable("orders")
    .set({
      status: "cancelled",
      idempotency_key: null,
      updated_at: new Date(),
    })
    .where("id", "=", orderId)
    .where("status", "=", "paid")
    .where("total_amount", "=", 0)
    .returningAll()
    .executeTakeFirst();
}

/**
 * Takes an order's idempotency key away, so a repeat of the request that
 * created it starts a new order. For an order nobody can continue: expired,
 * cancelled or refunded.
 */
export async function releaseOrderIdempotencyKey(
  database: Executor,
  orderId: string,
) {
  await database
    .updateTable("orders")
    .set({ idempotency_key: null, updated_at: new Date() })
    .where("id", "=", orderId)
    .execute();
}

/**
 * Ends unpaid orders early, as the expiry job would at their deadline. An
 * expired order no longer holds its coupon, and a payment that still arrives
 * for one is honoured (see markOrderPaidIfPending).
 */
export async function expirePendingOrders(
  database: Executor,
  orderIds: string[],
  now: Date,
) {
  if (orderIds.length === 0) return;
  await database
    .updateTable("orders")
    .set({ status: "expired", updated_at: now })
    .where("id", "in", orderIds)
    .where("status", "=", "pending")
    .execute();
}

/**
 * Cancels unpaid orders that a bank transfer was reported for, when the
 * buyer has enrolled for free in everything they sell (an order that also
 * sells something else is left alone). A cancelled order cannot
 * be paid any more, so the transfer can no longer be verified and is listed
 * for staff as money to check and return (needs-refund.repository.ts's
 * listStuckManualTransfers), where they can reject it.
 */
export async function cancelUnpaidOrders(
  database: Executor,
  orderIds: string[],
  now: Date,
) {
  if (orderIds.length === 0) return;
  await database
    .updateTable("orders")
    .set({ status: "cancelled", idempotency_key: null, updated_at: now })
    .where("id", "in", orderIds)
    .where("status", "in", ["pending", "payment_processing", "expired"])
    .execute();
}

/**
 * Cancels an order that was created a moment ago and never got a payment to
 * go with it, and gives up its idempotency key. Does nothing once a payment
 * row exists: that order can still be continued.
 */
export async function cancelOrderWithoutPayment(
  database: Executor,
  orderId: string,
) {
  return await database
    .updateTable("orders")
    .set({
      status: "cancelled",
      idempotency_key: null,
      updated_at: new Date(),
    })
    .where("id", "=", orderId)
    .where("status", "=", "pending")
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom("payments")
            .select("payments.id")
            .whereRef("payments.order_id", "=", "orders.id"),
        ),
      ),
    )
    .returning("id")
    .executeTakeFirst();
}

/**
 * Keeps what an order paid in another currency settles for (Razorpay names
 * it in rupees on a dollar payment), once: revenue reports count the order
 * through it. Nothing for an amount in the order's own currency.
 */
export async function recordOrderSettlement(
  database: Executor,
  orderId: string,
  settlement: { amount: number; currency: string },
) {
  await database
    .updateTable("orders")
    .set({
      settlement_amount: settlement.amount,
      settlement_currency: settlement.currency,
    })
    .where("id", "=", orderId)
    .where("currency", "<>", settlement.currency)
    .where("settlement_amount", "is", null)
    .execute();
}

/**
 * Marks the order paid and issues its invoice number. Every way an order
 * gets paid (gateway, verified transfer, free checkout) comes through here
 * inside its transaction, so the invoice numbers follow the order in which
 * payments were recorded.
 */
export async function markOrderPaidIfPending(
  database: Executor,
  orderId: string,
  paidAt: Date,
) {
  const paid = await database
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
  if (!paid) return paid;
  const invoiceNumber = await assignInvoiceNumber(database, orderId, paidAt);
  return { ...paid, invoice_number: invoiceNumber };
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
    .select(["display_name", "username", "email", "phone_no"])
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
