import { sql } from "kysely";
import type { OrderScope, OrderSortOrder } from "@veolms/contracts";
import type { Executor } from "../shared/repository.types.ts";
import {
  adminOrderConditions,
  allOf,
  type AdminOrderFilters,
} from "./order-filters.sql.ts";

/**
 * The academy Orders screen's reads that page by number, count, and add up
 * figures beyond the ones in order.repository.ts. Every read here applies the
 * same filters (order-filters.sql.ts).
 */

/** Orders that reached an outcome: what a success rate is out of. */
const SETTLED = sql`('paid', 'partially_refunded', 'refunded', 'payment_failed', 'cancelled', 'expired')`;
/** Orders that were paid, whatever happened after. */
const PAID_EVER = sql`('paid', 'partially_refunded', 'refunded')`;
/** Orders that count as sales (as the existing statistics count them). */
const SUCCESSFUL = sql`('paid', 'partially_refunded')`;

export async function listAdminOrdersPage(
  database: Executor,
  scope: OrderScope,
  filters: AdminOrderFilters,
  page: { number: number; size: number; sortOrder: OrderSortOrder },
) {
  const direction = page.sortOrder === "asc" ? sql`asc` : sql`desc`;
  return await database
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
    .where(allOf(adminOrderConditions(scope, filters)))
    .orderBy(sql`o.created_at ${direction}, o.id ${direction}`)
    .limit(page.size)
    .offset((page.number - 1) * page.size)
    .execute();
}

export async function countAdminOrders(
  database: Executor,
  scope: OrderScope,
  filters: AdminOrderFilters,
): Promise<number> {
  const row = await database
    .selectFrom("orders as o")
    .select(sql<number>`count(*)::int`.as("total"))
    .where(allOf(adminOrderConditions(scope, filters)))
    .executeTakeFirst();
  return Number(row?.total ?? 0);
}

export interface AdminOrderExtraStats {
  attempts: number;
  successfulAttempts: number;
  repeatBuyers: number;
  refundedOrders: number;
}

/**
 * The figures the Orders screen adds to the existing statistics. Attempts
 * leave out the status filter: a success rate under "Success only" would
 * otherwise always be 100%.
 */
export async function getAdminOrderExtraStats(
  database: Executor,
  scope: OrderScope,
  filters: AdminOrderFilters,
): Promise<AdminOrderExtraStats> {
  const withStatus = allOf(adminOrderConditions(scope, filters));
  const withoutStatus = allOf(
    adminOrderConditions(scope, { ...filters, statuses: undefined }),
  );

  const [attempts, cohort, repeaters] = await Promise.all([
    database
      .selectFrom("orders as o")
      .select([
        sql<number>`count(*) filter (where o.status in ${SETTLED})::int`.as(
          "attempts",
        ),
        sql<number>`count(*) filter (where o.status in ${PAID_EVER})::int`.as(
          "successful",
        ),
      ])
      .where(withoutStatus)
      .executeTakeFirst(),
    database
      .selectFrom("orders as o")
      .select([
        sql<number>`count(*) filter (where o.status in ('refunded', 'partially_refunded'))::int`.as(
          "refunded_orders",
        ),
      ])
      .where(withStatus)
      .executeTakeFirst(),
    sql<{ repeat_buyers: number }>`
      select count(*)::int as repeat_buyers from (
        select o.user_id from orders o
        where ${withStatus} and o.status in ${SUCCESSFUL}
        group by o.user_id
        having count(*) > 1
      ) repeaters
    `
      .execute(database)
      .then((result) => result.rows[0]),
  ]);

  return {
    attempts: Number(attempts?.attempts ?? 0),
    successfulAttempts: Number(attempts?.successful ?? 0),
    repeatBuyers: Number(repeaters?.repeat_buyers ?? 0),
    refundedOrders: Number(cohort?.refunded_orders ?? 0),
  };
}

/** What coupons took off the successful orders, per currency (minor units). */
export async function getAdminOrderDiscountTotals(
  database: Executor,
  scope: OrderScope,
  filters: AdminOrderFilters,
): Promise<Map<string, number>> {
  const rows = await database
    .selectFrom("orders as o")
    .select([
      "o.currency",
      sql<number>`coalesce(sum(o.discount_amount) filter (where o.status in ${SUCCESSFUL}), 0)::bigint`.as(
        "discount_total",
      ),
    ])
    .where(allOf(adminOrderConditions(scope, filters)))
    .groupBy("o.currency")
    .execute();
  return new Map(rows.map((row) => [row.currency, Number(row.discount_total)]));
}

export interface FreeOrderStatsRow {
  enrollments: number;
  uniqueLearners: number;
  mostEnrolled: { courseId: string; title: string; enrollments: number } | null;
  alsoBoughtPaid: number;
}

/** Figures for a view of free enrollments (`kind=free`). */
export async function getFreeOrderStats(
  database: Executor,
  scope: OrderScope,
  filters: AdminOrderFilters,
): Promise<FreeOrderStatsRow> {
  const where = allOf(
    adminOrderConditions(scope, { ...filters, kind: "free" }),
  );

  const [counts, top] = await Promise.all([
    database
      .selectFrom("orders as o")
      .select([
        sql<number>`count(*) filter (where o.status in ${SUCCESSFUL})::int`.as(
          "enrollments",
        ),
        sql<number>`count(distinct o.user_id) filter (where o.status in ${SUCCESSFUL})::int`.as(
          "unique_learners",
        ),
        sql<number>`count(distinct o.user_id) filter (
          where o.status in ${SUCCESSFUL}
            and exists (
              select 1 from orders paid
              where paid.user_id = o.user_id
                and paid.subtotal_amount > 0
                and paid.status in ${SUCCESSFUL}
            )
        )::int`.as("also_bought_paid"),
      ])
      .where(where)
      .executeTakeFirst(),
    database
      .selectFrom("orders as o")
      .innerJoin("order_items as oi", "oi.order_id", "o.id")
      .innerJoin("courses as c", "c.id", "oi.course_id")
      .select([
        "c.id as course_id",
        "c.title",
        sql<number>`count(distinct o.id)::int`.as("enrollments"),
      ])
      .where(where)
      .where(sql<boolean>`o.status in ${SUCCESSFUL}`)
      .groupBy(["c.id", "c.title"])
      .orderBy(sql`count(distinct o.id)`, "desc")
      .orderBy("c.title")
      .limit(1)
      .executeTakeFirst(),
  ]);

  return {
    enrollments: Number(counts?.enrollments ?? 0),
    uniqueLearners: Number(counts?.unique_learners ?? 0),
    alsoBoughtPaid: Number(counts?.also_bought_paid ?? 0),
    mostEnrolled: top
      ? {
          courseId: top.course_id,
          title: top.title,
          enrollments: Number(top.enrollments),
        }
      : null,
  };
}

/**
 * The courses the Orders screen can filter by: the published, listed ones
 * and any other (not deleted) that has orders, with what each costs.
 */
export async function listOrderCourseOptions(database: Executor) {
  return await database
    .selectFrom("courses as c")
    .leftJoin("course_pricing as cp", "cp.course_id", "c.id")
    .select([
      "c.id",
      "c.title",
      "c.thumbnail_url",
      "cp.pricing_type",
      "cp.sale_price",
      "cp.currency",
    ])
    .where("c.deleted_at", "is", null)
    .where((eb) =>
      eb.or([
        eb.and([
          eb("c.status", "=", "published"),
          eb("c.unlisted", "=", false),
        ]),
        eb.exists(
          eb
            .selectFrom("order_items as oi")
            .select(sql`1`.as("one"))
            .whereRef("oi.course_id", "=", "c.id"),
        ),
      ]),
    )
    .orderBy("c.sort_position", (order) => order.asc().nullsLast())
    .orderBy("c.created_at", "asc")
    .orderBy("c.id", "asc")
    .execute();
}
