import { sql, type RawBuilder } from "kysely";
import type { OrderScope } from "@veolms/contracts";
import type { Executor } from "../commerce/shared/repository.types.ts";
import { SURPLUS_CAPTURE_ERROR_CODE } from "../commerce/payments/surplus-payment.ts";

/**
 * The aggregate reads behind the Revenue and Courses tabs, and the daily
 * series the Overview shares with them. Order figures follow the same
 * cohort rule as `order.repository.ts`'s stats: an order belongs to the
 * day and range it was created in, a successful order is one in `paid` or
 * `partially_refunded`, and a refund counts against the order it refunds.
 * Order columns, refunds and payments are all minor units (paise), and so
 * is every amount that leaves here.
 */

export interface OrderWindow {
  courseId?: string | string[];
  from: Date;
  to: Date;
}

const SUCCESSFUL = sql<boolean>`o.status in ('paid', 'partially_refunded')`;

/** Processed refunds against order `o`, leaving out extra-payment refunds
 * (see order.repository.ts's `notOfExtraPayment`). */
const refundsOfOrder = sql<number>`(
  select coalesce(sum(r.amount), 0)
  from refunds r
  where r.order_id = o.id and r.status = 'processed'
    and not exists (
      select 1 from payments xp
      where xp.id = r.payment_id
        and xp.error_code = ${SURPLUS_CAPTURE_ERROR_CODE}
    )
)`;

/**
 * Orders a report in `currency` counts: those in that currency, and those
 * paid in another one (a sale at a course's price for buyers outside
 * India) that settled in it.
 */
function inReportCurrency(currency: string) {
  return sql<boolean>`(o.currency = ${currency} or o.settlement_currency = ${currency})`;
}

/**
 * An amount of order `o` (minor units of its own currency) in a report in
 * `currency`: as it is for an order in that currency, otherwise at the rate
 * the order settled at, its settlement amount against its total.
 */
function inReport(amount: RawBuilder<number>, currency: string) {
  return sql<number>`(case
    when o.currency = ${currency} then ${amount}
    when o.total_amount > 0 then round(${amount}::numeric * o.settlement_amount / o.total_amount)
    else 0 end)`;
}

function toIdList(courseId: string | string[] | undefined): string[] {
  if (!courseId) return [];
  return Array.isArray(courseId) ? courseId : [courseId];
}

function orderCourseFilter(courseIds: string[]) {
  return sql<boolean>`exists (
    select 1 from order_items oi
    where oi.order_id = o.id
      and oi.course_id = any(${courseIds}::uuid[])
  )`;
}

export interface DailyOrdersRow {
  date: string;
  grossSales: number;
  netRevenue: number;
  orders: number;
  refundedAmount: number;
  refunds: number;
}

export async function getDailyOrderSeries(
  database: Executor,
  scope: OrderScope,
  window: OrderWindow & { currency: string },
): Promise<DailyOrdersRow[]> {
  const day = sql`date_trunc('day', o.created_at at time zone 'UTC')`;
  let query = database
    .selectFrom("orders as o")
    .select([
      sql<string>`to_char(${day}, 'YYYY-MM-DD')`.as("date"),
      sql<number>`coalesce(sum(case when ${SUCCESSFUL} then ${inReport(sql`o.total_amount`, window.currency)} else 0 end), 0)::bigint`.as(
        "gross",
      ),
      sql<number>`count(*) filter (where ${SUCCESSFUL})::int`.as("orders"),
      sql<number>`coalesce(sum(case when ${SUCCESSFUL} then ${inReport(refundsOfOrder, window.currency)} else 0 end), 0)::bigint`.as(
        "refunded",
      ),
      sql<number>`count(*) filter (where o.status in ('partially_refunded', 'refunded'))::int`.as(
        "refunds",
      ),
    ])
    .where(inReportCurrency(window.currency))
    .where("o.created_at", ">=", window.from)
    .where("o.created_at", "<=", window.to)
    .groupBy(day)
    .orderBy(day);
  if (scope.type === "user") query = query.where("o.user_id", "=", scope.id);
  const courseIds = toIdList(window.courseId);
  if (courseIds.length > 0) query = query.where(orderCourseFilter(courseIds));

  const rows = await query.execute();
  return rows.map((row) => {
    const grossSales = Number(row.gross);
    const refundedAmount = Number(row.refunded);
    return {
      date: row.date,
      grossSales,
      netRevenue: grossSales - refundedAmount,
      orders: Number(row.orders),
      refundedAmount,
      refunds: Number(row.refunds),
    };
  });
}

export interface RevenueByProductRow {
  id: string;
  type: "course" | "bundle" | "quiz";
  title: string;
  netRevenue: number;
  orders: number;
}

export async function getRevenueByProduct(
  database: Executor,
  scope: OrderScope,
  window: OrderWindow & { currency: string; limit: number },
): Promise<RevenueByProductRow[]> {
  const productId = sql<string>`coalesce(oi.course_id, oi.bundle_id, oi.quiz_pricing_id, oi.id)::text`;
  const itemRefunds = sql<number>`(
    select coalesce(sum(r.amount), 0)
    from refunds r
    where r.order_item_id = oi.id and r.status = 'processed'
  )`;
  let query = database
    .selectFrom("order_items as oi")
    .innerJoin("orders as o", "o.id", "oi.order_id")
    .leftJoin("courses as c", "c.id", "oi.course_id")
    .leftJoin("course_bundles as b", "b.id", "oi.bundle_id")
    .select([
      productId.as("product_id"),
      "oi.item_type as type",
      sql<string>`coalesce(max(c.title), max(b.title), max(oi.title_snapshot))`.as(
        "title",
      ),
      sql<number>`coalesce(sum(${inReport(sql`oi.final_amount`, window.currency)}), 0)::bigint`.as(
        "gross",
      ),
      sql<number>`coalesce(sum(${inReport(itemRefunds, window.currency)}), 0)::bigint`.as(
        "refunded",
      ),
      sql<number>`count(distinct o.id)::int`.as("orders"),
    ])
    .where(SUCCESSFUL)
    .where(inReportCurrency(window.currency))
    .where("o.created_at", ">=", window.from)
    .where("o.created_at", "<=", window.to)
    .groupBy([productId, "oi.item_type"])
    .orderBy(
      sql`sum(${inReport(sql`oi.final_amount`, window.currency)})`,
      "desc",
    )
    .limit(window.limit);
  if (scope.type === "user") query = query.where("o.user_id", "=", scope.id);
  const courseIds = toIdList(window.courseId);
  if (courseIds.length > 0) {
    query = query.where("oi.course_id", "in", courseIds);
  }

  const rows = await query.execute();
  return rows.map((row) => ({
    id: row.product_id,
    type: row.type,
    title: row.title,
    netRevenue: Number(row.gross) - Number(row.refunded),
    orders: Number(row.orders),
  }));
}

export interface RevenueSourceRow {
  source: "full_price" | "coupon" | "free";
  orders: number;
  netRevenue: number;
}

export async function getRevenueSources(
  database: Executor,
  scope: OrderScope,
  window: OrderWindow & { currency: string },
): Promise<RevenueSourceRow[]> {
  const source = sql<RevenueSourceRow["source"]>`case
    when o.total_amount <= 0 then 'free'
    when o.coupon_id is not null then 'coupon'
    else 'full_price' end`;
  let query = database
    .selectFrom("orders as o")
    .select([
      source.as("source"),
      sql<number>`count(*)::int`.as("orders"),
      sql<number>`coalesce(sum(${inReport(sql`o.total_amount`, window.currency)}), 0)::bigint`.as(
        "gross",
      ),
      sql<number>`coalesce(sum(${inReport(refundsOfOrder, window.currency)}), 0)::bigint`.as(
        "refunded",
      ),
    ])
    .where(SUCCESSFUL)
    .where(inReportCurrency(window.currency))
    .where("o.created_at", ">=", window.from)
    .where("o.created_at", "<=", window.to)
    .groupBy(source);
  if (scope.type === "user") query = query.where("o.user_id", "=", scope.id);
  const courseIds = toIdList(window.courseId);
  if (courseIds.length > 0) query = query.where(orderCourseFilter(courseIds));

  const rows = await query.execute();
  const bySource = new Map(
    rows.map((row) => [
      row.source,
      {
        source: row.source,
        orders: Number(row.orders),
        netRevenue: Number(row.gross) - Number(row.refunded),
      },
    ]),
  );
  return (["full_price", "coupon", "free"] as const).map(
    (key) => bySource.get(key) ?? { source: key, orders: 0, netRevenue: 0 },
  );
}

export interface PaymentMethodRow {
  method: string;
  orders: number;
  amount: number;
}

/**
 * Successful orders by the method of the payment that settled them (the
 * gateway's name: upi, card, netbanking, wallet; "free" for a zero order;
 * "unknown" where the record carries none, as imported orders do). The
 * amount is the order's own total, so the card agrees with Gross Sales:
 * an imported payment row can hold an amount that is not the order's.
 */
export async function getPaymentMethods(
  database: Executor,
  scope: OrderScope,
  window: OrderWindow & { currency: string },
): Promise<PaymentMethodRow[]> {
  // The method is settled per order in a derived table first: Postgres
  // will not group by an expression that holds a correlated subquery.
  const courseIds = toIdList(window.courseId);
  const scopeFilter =
    scope.type === "user" ? sql`and o.user_id = ${scope.id}` : sql``;
  const courseFilter =
    courseIds.length > 0 ? sql`and ${orderCourseFilter(courseIds)}` : sql``;
  const result = await sql<{ method: string; orders: number; gross: number }>`
    select method, count(*)::int as orders,
      coalesce(sum(total_amount), 0)::bigint as gross
    from (
      select ${inReport(sql`o.total_amount`, window.currency)} as total_amount,
        coalesce((
          select lower(p.payment_method ->> 'method')
          from payments p
          where p.order_id = o.id and p.status = 'captured'
            and (p.error_code is null or p.error_code <> ${SURPLUS_CAPTURE_ERROR_CODE})
            and p.payment_method ->> 'method' is not null
          order by p.created_at
          limit 1
        ), case when o.total_amount <= 0 then 'free' else 'unknown' end) as method
      from orders o
      where ${SUCCESSFUL}
        and ${inReportCurrency(window.currency)}
        and o.created_at >= ${window.from}
        and o.created_at <= ${window.to}
        ${scopeFilter}
        ${courseFilter}
    ) settled
    group by method
    order by gross desc
  `.execute(database);

  return result.rows.map((row) => ({
    method: row.method,
    orders: Number(row.orders),
    amount: Number(row.gross),
  }));
}

export interface CouponPerformanceRow {
  couponId: string;
  code: string;
  orders: number;
  grossSales: number;
  discountGiven: number;
  netRevenue: number;
}

export async function getCouponPerformance(
  database: Executor,
  scope: OrderScope,
  window: OrderWindow & { currency: string; limit: number },
): Promise<CouponPerformanceRow[]> {
  let query = database
    .selectFrom("orders as o")
    .innerJoin("coupons as cp", "cp.id", "o.coupon_id")
    .select([
      "cp.id as coupon_id",
      "cp.code",
      sql<number>`count(*)::int`.as("orders"),
      sql<number>`coalesce(sum(${inReport(sql`o.total_amount`, window.currency)}), 0)::bigint`.as(
        "gross",
      ),
      sql<number>`coalesce(sum(${inReport(sql`o.discount_amount`, window.currency)}), 0)::bigint`.as(
        "discount",
      ),
      sql<number>`coalesce(sum(${inReport(refundsOfOrder, window.currency)}), 0)::bigint`.as(
        "refunded",
      ),
    ])
    .where(SUCCESSFUL)
    .where(inReportCurrency(window.currency))
    .where("o.created_at", ">=", window.from)
    .where("o.created_at", "<=", window.to)
    .groupBy(["cp.id", "cp.code"])
    .orderBy(
      sql`sum(${inReport(sql`o.total_amount`, window.currency)})`,
      "desc",
    )
    .limit(window.limit);
  if (scope.type === "user") query = query.where("o.user_id", "=", scope.id);
  const courseIds = toIdList(window.courseId);
  if (courseIds.length > 0) query = query.where(orderCourseFilter(courseIds));

  const rows = await query.execute();
  return rows.map((row) => {
    const grossSales = Number(row.gross);
    return {
      couponId: row.coupon_id,
      code: row.code,
      orders: Number(row.orders),
      grossSales,
      discountGiven: Number(row.discount),
      netRevenue: grossSales - Number(row.refunded),
    };
  });
}

export interface TopRevenueCourseRow {
  courseId: string;
  title: string;
  grossSales: number;
  netRevenue: number;
  orders: number;
  buyers: number;
  refundedAmount: number;
  averageOrderValue: number;
}

/**
 * Courses by what their order lines earned. An order-level refund (one not
 * tied to a line) is counted against every course line of that order: a
 * single-course order, the usual case, is exact.
 */
export async function getTopRevenueCourses(
  database: Executor,
  scope: OrderScope,
  window: OrderWindow & { currency: string; limit: number },
): Promise<TopRevenueCourseRow[]> {
  const lineRefunds = sql<number>`(
    select coalesce(sum(r.amount), 0)
    from refunds r
    where r.order_id = o.id and r.status = 'processed'
      and (r.order_item_id = oi.id or r.order_item_id is null)
      and not exists (
        select 1 from payments xp
        where xp.id = r.payment_id
          and xp.error_code = ${SURPLUS_CAPTURE_ERROR_CODE}
      )
  )`;
  let query = database
    .selectFrom("order_items as oi")
    .innerJoin("orders as o", "o.id", "oi.order_id")
    .innerJoin("courses as c", "c.id", "oi.course_id")
    .select([
      "c.id as course_id",
      "c.title",
      sql<number>`coalesce(sum(${inReport(sql`oi.final_amount`, window.currency)}), 0)::bigint`.as(
        "gross",
      ),
      sql<number>`coalesce(sum(${inReport(lineRefunds, window.currency)}), 0)::bigint`.as(
        "refunded",
      ),
      sql<number>`count(distinct o.id)::int`.as("orders"),
      sql<number>`count(distinct o.user_id)::int`.as("buyers"),
    ])
    .where(SUCCESSFUL)
    .where(inReportCurrency(window.currency))
    .where("o.created_at", ">=", window.from)
    .where("o.created_at", "<=", window.to)
    .groupBy(["c.id", "c.title"])
    .orderBy(
      sql`sum(${inReport(sql`oi.final_amount`, window.currency)})`,
      "desc",
    )
    .limit(window.limit);
  if (scope.type === "user") query = query.where("o.user_id", "=", scope.id);
  const courseIds = toIdList(window.courseId);
  if (courseIds.length > 0) {
    query = query.where("oi.course_id", "in", courseIds);
  }

  const rows = await query.execute();
  return rows.map((row) => {
    const grossSales = Number(row.gross);
    const refundedAmount = Number(row.refunded);
    const orders = Number(row.orders);
    return {
      courseId: row.course_id,
      title: row.title,
      grossSales,
      netRevenue: grossSales - refundedAmount,
      orders,
      buyers: Number(row.buyers),
      refundedAmount,
      averageOrderValue: orders > 0 ? Math.round(grossSales / orders) : 0,
    };
  });
}

/**
 * Items added to a cart in the range and still there: a cart line is
 * deleted when it is bought or taken out, so this is what is waiting.
 */
export async function countItemsInCarts(
  database: Executor,
  window: OrderWindow,
): Promise<number> {
  let query = database
    .selectFrom("cart_items")
    .select(sql<number>`count(*)::int`.as("total"))
    .where("created_at", ">=", window.from)
    .where("created_at", "<=", window.to);
  const courseIds = toIdList(window.courseId);
  if (courseIds.length > 0) query = query.where("course_id", "in", courseIds);
  const row = await query.executeTakeFirst();
  return Number(row?.total ?? 0);
}

/** Learners with at least one enrollment created by `asOf`. */
export async function countEnrolledLearnersAsOf(
  database: Executor,
  filters: { courseId?: string | string[]; asOf: Date },
): Promise<number> {
  let query = database
    .selectFrom("enrollments")
    .select(sql<number>`count(distinct user_id)::int`.as("total"))
    .where("created_at", "<=", filters.asOf);
  const courseIds = toIdList(filters.courseId);
  if (courseIds.length > 0) query = query.where("course_id", "in", courseIds);
  const row = await query.executeTakeFirst();
  return Number(row?.total ?? 0);
}

export async function getDailyEnrollments(
  database: Executor,
  window: OrderWindow,
): Promise<Array<{ date: string; value: number }>> {
  const day = sql`date_trunc('day', created_at at time zone 'UTC')`;
  let query = database
    .selectFrom("enrollments")
    .select([
      sql<string>`to_char(${day}, 'YYYY-MM-DD')`.as("date"),
      sql<number>`count(*)::int`.as("value"),
    ])
    .where("created_at", ">=", window.from)
    .where("created_at", "<=", window.to)
    .groupBy(day)
    .orderBy(day);
  const courseIds = toIdList(window.courseId);
  if (courseIds.length > 0) query = query.where("course_id", "in", courseIds);
  const rows = await query.execute();
  return rows.map((row) => ({ date: row.date, value: Number(row.value) }));
}

/** Orders (successful) per course in the range, for the overview table. */
export async function getOrderCountsByCourse(
  database: Executor,
  scope: OrderScope,
  window: OrderWindow & { courseIds: string[] },
): Promise<Map<string, number>> {
  if (window.courseIds.length === 0) return new Map();
  let query = database
    .selectFrom("order_items as oi")
    .innerJoin("orders as o", "o.id", "oi.order_id")
    .select([
      "oi.course_id",
      sql<number>`count(distinct o.id)::int`.as("orders"),
    ])
    .where(SUCCESSFUL)
    .where("oi.course_id", "in", window.courseIds)
    .where("o.created_at", ">=", window.from)
    .where("o.created_at", "<=", window.to)
    .groupBy("oi.course_id");
  if (scope.type === "user") query = query.where("o.user_id", "=", scope.id);
  const rows = await query.execute();
  return new Map(
    rows.map((row) => [row.course_id as string, Number(row.orders)]),
  );
}

// ---------------------------------------------------------------------------
// Courses & Content
// ---------------------------------------------------------------------------

export interface ContentSnapshot {
  publishedCourses: number;
  publishedLessons: number;
  videoSeconds: number;
}

/**
 * The catalogue as it stood at `asOf`: courses published by then, lessons
 * created and published by then, and the video they hold. Current
 * publication state is used (a lesson unpublished since is left out):
 * the past state is not recorded.
 */
export async function getContentSnapshotAsOf(
  database: Executor,
  filters: { courseId?: string | string[]; asOf: Date },
): Promise<ContentSnapshot> {
  const courseIds = toIdList(filters.courseId);
  const courseFilter =
    courseIds.length > 0 ? sql`and c.id = any(${courseIds}::uuid[])` : sql``;
  const row = await sql<{
    published_courses: number;
    published_lessons: number;
    video_seconds: number;
  }>`
    select
      (
        select count(*)::int from courses c
        where c.deleted_at is null and c.status = 'published'
          and c.published_at is not null and c.published_at <= ${filters.asOf}
          ${courseFilter}
      ) as published_courses,
      (
        select count(*)::int
        from course_lessons l
        join courses c on c.id = l.course_id
        where l.deleted_at is null and l.is_published
          and l.created_at <= ${filters.asOf}
          and c.deleted_at is null
          ${courseFilter}
      ) as published_lessons,
      (
        select coalesce(sum(m.duration_seconds), 0)::bigint
        from course_lessons l
        join courses c on c.id = l.course_id
        join media_assets m on m.id = l.content_media_id
        where l.deleted_at is null and l.is_published
          and l.content_type = 'video'
          and l.created_at <= ${filters.asOf}
          and c.deleted_at is null
          ${courseFilter}
      ) as video_seconds
  `.execute(database);
  const first = row.rows[0];
  return {
    publishedCourses: Number(first?.published_courses ?? 0),
    publishedLessons: Number(first?.published_lessons ?? 0),
    videoSeconds: Number(first?.video_seconds ?? 0),
  };
}

export interface ContentInsightsRow {
  courses: number;
  publishedCourses: number;
  sections: number;
  lessons: number;
  videoLessons: number;
  documentLessons: number;
  quizLessons: number;
  resources: number;
  videoSeconds: number;
}

export async function getContentInsights(
  database: Executor,
  filters: { courseId?: string | string[] },
): Promise<ContentInsightsRow> {
  const courseIds = toIdList(filters.courseId);
  const courseFilter =
    courseIds.length > 0 ? sql`and c.id = any(${courseIds}::uuid[])` : sql``;
  const result = await sql<{
    courses: number;
    published_courses: number;
    sections: number;
    lessons: number;
    video_lessons: number;
    document_lessons: number;
    quiz_lessons: number;
    resources: number;
    video_seconds: number;
  }>`
    with scoped_courses as (
      select c.id from courses c
      where c.deleted_at is null and c.status <> 'archived' ${courseFilter}
    ),
    scoped_lessons as (
      select l.id, l.content_type, l.content_media_id
      from course_lessons l
      where l.deleted_at is null and l.is_published
        and l.course_id in (select id from scoped_courses)
    )
    select
      (select count(*)::int from scoped_courses) as courses,
      (
        select count(*)::int from courses c
        where c.deleted_at is null and c.status = 'published' ${courseFilter}
      ) as published_courses,
      (
        select count(*)::int from course_sections s
        where s.deleted_at is null
          and s.course_id in (select id from scoped_courses)
      ) as sections,
      (select count(*)::int from scoped_lessons) as lessons,
      (select count(*)::int from scoped_lessons where content_type = 'video') as video_lessons,
      (select count(*)::int from scoped_lessons where content_type = 'document') as document_lessons,
      (select count(*)::int from scoped_lessons where content_type = 'quiz') as quiz_lessons,
      (
        select count(*)::int from lesson_resources lr
        where lr.deleted_at is null
          and lr.lesson_id in (select id from scoped_lessons)
      ) as resources,
      (
        select coalesce(sum(m.duration_seconds), 0)::bigint
        from scoped_lessons sl
        join media_assets m on m.id = sl.content_media_id
        where sl.content_type = 'video'
      ) as video_seconds
  `.execute(database);
  const row = result.rows[0];
  return {
    courses: Number(row?.courses ?? 0),
    publishedCourses: Number(row?.published_courses ?? 0),
    sections: Number(row?.sections ?? 0),
    lessons: Number(row?.lessons ?? 0),
    videoLessons: Number(row?.video_lessons ?? 0),
    documentLessons: Number(row?.document_lessons ?? 0),
    quizLessons: Number(row?.quiz_lessons ?? 0),
    resources: Number(row?.resources ?? 0),
    videoSeconds: Number(row?.video_seconds ?? 0),
  };
}

export interface QuizSummaryRow {
  attempts: number;
  submitted: number;
  passRate: number;
  averageScore: number;
}

/** Quiz attempts started in the range, through their course assignment. */
export async function getQuizSummary(
  database: Executor,
  window: OrderWindow,
): Promise<QuizSummaryRow> {
  const finished = sql`qa.status in ('submitted', 'graded')`;
  let query = database
    .selectFrom("quiz_attempts as qa")
    .innerJoin("quiz_assignments as qs", "qs.id", "qa.assignment_id")
    .select([
      sql<number>`count(*)::int`.as("attempts"),
      sql<number>`count(*) filter (where ${finished})::int`.as("submitted"),
      sql<number>`coalesce(
        100.0 * count(*) filter (where ${finished} and qa.is_passed)
          / nullif(count(*) filter (where ${finished}), 0),
        0)`.as("pass_rate"),
      sql<number>`coalesce(avg(qa.score_percentage) filter (where ${finished}), 0)`.as(
        "average_score",
      ),
    ])
    .where("qa.started_at", ">=", window.from)
    .where("qa.started_at", "<=", window.to);
  const courseIds = toIdList(window.courseId);
  if (courseIds.length > 0) {
    query = query.where("qs.course_id", "in", courseIds);
  }
  const row = await query.executeTakeFirst();
  return {
    attempts: Number(row?.attempts ?? 0),
    submitted: Number(row?.submitted ?? 0),
    passRate: Number(row?.pass_rate ?? 0),
    averageScore: Number(row?.average_score ?? 0),
  };
}

export interface CourseContentCountsRow {
  courseId: string;
  lessons: number;
  videoSeconds: number;
  learners: number;
}

/** Published lesson count, video length and total enrolled learners per course. */
export async function listCourseContentCounts(
  database: Executor,
  courseIds: string[],
): Promise<CourseContentCountsRow[]> {
  if (courseIds.length === 0) return [];
  const result = await sql<{
    course_id: string;
    lessons: number;
    video_seconds: number;
    learners: number;
  }>`
    select
      c.id as course_id,
      (
        select count(*)::int from course_lessons l
        where l.course_id = c.id and l.deleted_at is null and l.is_published
      ) as lessons,
      (
        select coalesce(sum(m.duration_seconds), 0)::bigint
        from course_lessons l
        join media_assets m on m.id = l.content_media_id
        where l.course_id = c.id and l.deleted_at is null and l.is_published
          and l.content_type = 'video'
      ) as video_seconds,
      (
        select count(distinct e.user_id)::int from enrollments e
        where e.course_id = c.id
      ) as learners
    from courses c
    where c.id = any(${courseIds}::uuid[])
  `.execute(database);
  return result.rows.map((row) => ({
    courseId: row.course_id,
    lessons: Number(row.lessons),
    videoSeconds: Number(row.video_seconds),
    learners: Number(row.learners),
  }));
}
