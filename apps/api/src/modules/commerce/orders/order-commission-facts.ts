import type { DatabaseExecutor } from "@veolms/database";
import type { OrderItemType, RefundStatus } from "@veolms/database";
import { sql } from "kysely";

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

export type CommissionProductType = "course" | "bundle" | "workshop" | "quiz";

/**
 * Titles of the products commission rules point at. A quiz pass is named
 * after its course. Products since deleted are left out.
 */
export async function listProductTitles(
  executor: DatabaseExecutor,
  refs: readonly { type: CommissionProductType; id: string }[],
): Promise<Map<string, string>> {
  const ids = (type: CommissionProductType) => [
    ...new Set(refs.filter((ref) => ref.type === type).map((ref) => ref.id)),
  ];
  const titles = new Map<string, string>();
  const courseIds = ids("course");
  if (courseIds.length) {
    for (const row of await executor
      .selectFrom("courses")
      .select(["id", "title"])
      .where("id", "in", courseIds)
      .execute())
      titles.set(`course:${row.id}`, row.title);
  }
  const bundleIds = ids("bundle");
  if (bundleIds.length) {
    for (const row of await executor
      .selectFrom("course_bundles")
      .select(["id", "title"])
      .where("id", "in", bundleIds)
      .execute())
      titles.set(`bundle:${row.id}`, row.title);
  }
  const workshopIds = ids("workshop");
  if (workshopIds.length) {
    for (const row of await executor
      .selectFrom("workshops")
      .select(["id", "title"])
      .where("id", "in", workshopIds)
      .execute())
      titles.set(`workshop:${row.id}`, row.title);
  }
  const quizIds = ids("quiz");
  if (quizIds.length) {
    for (const row of await executor
      .selectFrom("course_quiz_pricing as q")
      .innerJoin("courses as c", "c.id", "q.course_id")
      .select(["q.id", "c.title"])
      .where("q.id", "in", quizIds)
      .execute())
      titles.set(`quiz:${row.id}`, `Quizzes: ${row.title}`);
  }
  return titles;
}

/** What a commission rule may be limited to, for the rule form. */
export async function listProductOptions(
  executor: DatabaseExecutor,
): Promise<{ type: CommissionProductType; id: string; title: string }[]> {
  const [courses, bundles, workshops] = await Promise.all([
    executor
      .selectFrom("courses")
      .select(["id", "title"])
      .orderBy("title")
      .limit(500)
      .execute(),
    executor
      .selectFrom("course_bundles")
      .select(["id", "title"])
      .orderBy("title")
      .limit(200)
      .execute(),
    executor
      .selectFrom("workshops")
      .select(["id", "title"])
      .orderBy("title")
      .limit(200)
      .execute(),
  ]);
  return [
    ...courses.map((row) => ({ type: "course" as const, ...row })),
    ...bundles.map((row) => ({ type: "bundle" as const, ...row })),
    ...workshops.map((row) => ({ type: "workshop" as const, ...row })),
  ];
}

/**
 * Net revenue of orders paid in a period, in one settled currency: totals
 * less processed refunds, an order that settled in another currency at the
 * rate it settled at (as the revenue reports count it). `attributedOnly`
 * keeps the orders credited to an affiliate.
 */
export async function sumPaidOrderRevenue(
  executor: DatabaseExecutor,
  input: { from: Date; to: Date; currency: string; attributedOnly: boolean },
): Promise<{ orders: number; net: number }> {
  const inSettled = (amount: ReturnType<typeof sql>) => sql<number>`(case
    when o.settlement_currency is not null and o.total_amount > 0
      then round(${amount}::numeric * o.settlement_amount / o.total_amount)
    else ${amount} end)`;
  let query = executor
    .selectFrom("orders as o")
    .select([
      sql<string>`count(*) filter (where o.status <> 'refunded')`.as("orders"),
      sql<string>`coalesce(sum(${inSettled(sql`o.total_amount - (
        select coalesce(sum(r.amount), 0) from refunds r
        where r.order_id = o.id and r.status = 'processed')`)}), 0)`.as("net"),
    ])
    .where("o.status", "in", ["paid", "partially_refunded", "refunded"])
    .where("o.paid_at", ">=", input.from)
    .where("o.paid_at", "<", input.to)
    .where(
      sql<boolean>`coalesce(o.settlement_currency, o.currency) = ${input.currency}`,
    );
  if (input.attributedOnly) {
    query = query.where(
      sql<boolean>`exists (select 1 from affiliate_order_attributions a where a.order_id = o.id)`,
    );
  }
  const row = await query.executeTakeFirstOrThrow();
  return { orders: Number(row.orders), net: Number(row.net) };
}
