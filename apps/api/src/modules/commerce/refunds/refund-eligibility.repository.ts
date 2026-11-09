import type { DatabaseExecutor as Executor } from "@veolms/database";
import { sql } from "kysely";

export interface OrderWatchTotals {
  orderId: string;
  /** The length of every video the order opens. */
  courseSeconds: number;
  /** What the learner's progress covers of those videos. */
  watchedSeconds: number;
}

/**
 * How much of what each order opens its buyer has watched, in seconds.
 *
 * What an order opens: the courses it granted (`order_item_courses`, with
 * the course items themselves for orders paid before that table), and what
 * those courses open of other courses through `course_links`, limited to
 * the sections a link names. That covers a course, a bundle, and part of a
 * course bought on its own. Only published lessons of live sections count;
 * a lesson reached twice counts once.
 *
 * Watched is each video's length times the furthest the learner got into
 * it, the same estimate the analytics use: playback is not timed.
 */
export async function getOrderWatchTotals(
  database: Executor,
  userId: string,
  orderIds: readonly string[],
): Promise<OrderWatchTotals[]> {
  if (orderIds.length === 0) return [];
  const result = await sql<{
    order_id: string;
    course_seconds: string | number;
    watched_seconds: string | number;
  }>`
    with granted as (
      select oic.order_id, oic.course_id
      from order_item_courses oic
      where oic.order_id = any(${[...orderIds]}::uuid[])
      union
      select oi.order_id, oi.course_id
      from order_items oi
      where oi.order_id = any(${[...orderIds]}::uuid[])
        and oi.course_id is not null
    ),
    scope as (
      select g.order_id, l.id as lesson_id, l.content_media_id
      from granted g
      join course_lessons l on l.course_id = g.course_id
      join course_sections s on s.id = l.section_id and s.deleted_at is null
      where l.deleted_at is null and l.is_published
      union
      select g.order_id, l.id as lesson_id, l.content_media_id
      from granted g
      join course_links cl on cl.course_id = g.course_id
      join courses lc on lc.id = cl.linked_course_id and lc.deleted_at is null
      join course_lessons l on l.course_id = cl.linked_course_id
      join course_sections s on s.id = l.section_id and s.deleted_at is null
      where l.deleted_at is null and l.is_published
        and (cl.section_ids is null or l.section_id = any(cl.section_ids))
    ),
    progress as (
      select lp.lesson_id, max(lp.progress_percent) as percent
      from learning_progress lp
      where lp.user_id = ${userId}
        and lp.lesson_id in (select lesson_id from scope)
      group by lp.lesson_id
    )
    select
      sc.order_id,
      coalesce(sum(coalesce(ma.duration_seconds, 0)), 0) as course_seconds,
      coalesce(
        sum(coalesce(ma.duration_seconds, 0) * coalesce(p.percent, 0) / 100.0),
        0
      ) as watched_seconds
    from scope sc
    left join media_assets ma on ma.id = sc.content_media_id
    left join progress p on p.lesson_id = sc.lesson_id
    group by sc.order_id
  `.execute(database);

  return result.rows.map((row) => ({
    orderId: row.order_id,
    courseSeconds: Number(row.course_seconds) || 0,
    watchedSeconds: Number(row.watched_seconds) || 0,
  }));
}

export interface OrderQuizTotals {
  orderId: string;
  /** The live quizzes the order's quiz passes open. */
  total: number;
  /** Of those, the ones the learner has started an attempt on. */
  attempted: number;
}

/**
 * For each order with a quiz pass in it: how many of the quizzes it opens
 * the buyer has attempted. A quiz pass opens every quiz attached to its
 * course (`course_quiz_pricing`), and each attached quiz is a
 * `quiz_assignments` row; those of deleted quizzes, and of deleted or
 * unpublished lessons, are not offered and do not count. An attempt still
 * in progress counts: its questions have been seen.
 */
export async function getOrderQuizTotals(
  database: Executor,
  userId: string,
  orderIds: readonly string[],
): Promise<OrderQuizTotals[]> {
  if (orderIds.length === 0) return [];
  const result = await sql<{
    order_id: string;
    total: string | number;
    attempted: string | number;
  }>`
    with passes as (
      select oi.order_id, qp.course_id
      from order_items oi
      join course_quiz_pricing qp on qp.id = oi.quiz_pricing_id
      where oi.order_id = any(${[...orderIds]}::uuid[])
        and oi.item_type = 'quiz'
    ),
    offered as (
      select distinct p.order_id, qa.id as assignment_id
      from passes p
      join quiz_assignments qa on qa.course_id = p.course_id
      join quizzes q on q.id = qa.quiz_id and q.deleted_at is null
      join course_lessons l on l.id = qa.lesson_id
        and l.deleted_at is null and l.is_published
    )
    select
      o.order_id,
      count(*) as total,
      count(*) filter (
        where exists (
          select 1 from quiz_attempts a
          where a.assignment_id = o.assignment_id and a.user_id = ${userId}
        )
      ) as attempted
    from offered o
    group by o.order_id
  `.execute(database);

  return result.rows.map((row) => ({
    orderId: row.order_id,
    total: Number(row.total) || 0,
    attempted: Number(row.attempted) || 0,
  }));
}

export interface RefundableOrderRow {
  id: string;
  user_id: string;
  status: string;
  total_amount: number;
  paid_at: Date | null;
}

/** The orders, if they are this user's, with what decides a refund. */
export function listOrdersForRefund(
  database: Executor,
  userId: string,
  orderIds: readonly string[],
): Promise<RefundableOrderRow[]> {
  if (orderIds.length === 0) return Promise.resolve([]);
  return database
    .selectFrom("orders")
    .select(["id", "user_id", "status", "total_amount", "paid_at"])
    .where("user_id", "=", userId)
    .where("id", "in", [...orderIds])
    .execute();
}

/** The refund request already made for each order, if any. */
export function listRefundRequestStatuses(
  database: Executor,
  orderIds: readonly string[],
): Promise<
  { id: string; order_id: string; status: string; created_at: Date }[]
> {
  if (orderIds.length === 0) return Promise.resolve([]);
  return database
    .selectFrom("refund_requests")
    .select(["id", "order_id", "status", "created_at"])
    .where("order_id", "in", [...orderIds])
    .execute();
}

/**
 * Of these orders, the ones with a refund under way or made: one the
 * gateway has not answered yet, or one it confirmed. A refund that failed
 * is neither, and leaves the order to be refunded again.
 */
export async function listOrdersWithLiveRefund(
  database: Executor,
  orderIds: readonly string[],
): Promise<Set<string>> {
  if (orderIds.length === 0) return new Set();
  const rows = await database
    .selectFrom("refunds")
    .select("order_id")
    .distinct()
    .where("order_id", "in", [...orderIds])
    .where("status", "in", ["pending", "processed"])
    .execute();
  return new Set(rows.map((row) => row.order_id));
}

/** Whether a refund of the order is still waiting on the gateway. */
export async function hasPendingRefund(
  database: Executor,
  orderId: string,
): Promise<boolean> {
  const row = await database
    .selectFrom("refunds")
    .select("id")
    .where("order_id", "=", orderId)
    .where("status", "=", "pending")
    .executeTakeFirst();
  return Boolean(row);
}

/** How many refunds of the order failed: each retry is a new attempt. */
export async function countFailedRefunds(
  database: Executor,
  orderId: string,
): Promise<number> {
  const row = await database
    .selectFrom("refunds")
    .select((eb) => eb.fn.countAll<string>().as("n"))
    .where("order_id", "=", orderId)
    .where("status", "=", "failed")
    .executeTakeFirst();
  return Number(row?.n ?? 0);
}

/**
 * When the learner sent the bank or UPI transfer that paid each order: the
 * request staff verified. The order's `paid_at` is when staff confirmed it,
 * which can be days later.
 */
export async function listTransferSentAt(
  database: Executor,
  orderIds: readonly string[],
): Promise<Map<string, Date>> {
  if (orderIds.length === 0) return new Map();
  const rows = await database
    .selectFrom("manual_payment_requests")
    .select(["order_id", (eb) => eb.fn.min("created_at").as("sent_at")])
    .where("order_id", "in", [...orderIds])
    .where("status", "=", "verified")
    .groupBy("order_id")
    .execute();
  return new Map(
    rows.map((row) => [row.order_id, new Date(row.sent_at as Date)]),
  );
}

/**
 * Of these orders, the ones that bought part of a course (an unlisted
 * course opening some of another's sections) whose price was then credited
 * toward the whole course: a later order of the buyer's for the course the
 * part opens, where the credit was taken. The credit is recorded only as
 * that item's `discount_amount` (pricing's upgrade credit: no coupon is
 * taken on an upgrade), so an upgrade with none (parts paid in another
 * currency, say) credited nothing and leaves the part refundable.
 *
 * An upgrade still being paid counts: its price was fixed, credit taken,
 * at checkout. A part refunded first brings no credit to a later checkout
 * (upgrade-credit.ts counts paid parts only).
 */
export async function listOrdersCreditedToUpgrade(
  database: Executor,
  orderIds: readonly string[],
): Promise<Set<string>> {
  if (orderIds.length === 0) return new Set();
  const result = await sql<{ order_id: string }>`
    select distinct part_o.id as order_id
    from orders part_o
    join order_items part_i on part_i.order_id = part_o.id
    join courses part_c on part_c.id = part_i.course_id and part_c.unlisted
    join course_links cl
      on cl.course_id = part_c.id and cl.section_ids is not null
    join order_items up_i on up_i.course_id = cl.linked_course_id
    join orders up_o on up_o.id = up_i.order_id
    where part_o.id = any(${[...orderIds]}::uuid[])
      and up_o.user_id = part_o.user_id
      and up_o.id <> part_o.id
      and up_o.status in
        ('pending', 'payment_processing', 'paid', 'partially_refunded')
      and up_o.created_at > part_o.paid_at
      and up_i.discount_amount > 0
  `.execute(database);
  return new Set(result.rows.map((row) => row.order_id));
}
