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
): Promise<{ order_id: string; status: string }[]> {
  if (orderIds.length === 0) return Promise.resolve([]);
  return database
    .selectFrom("refund_requests")
    .select(["order_id", "status"])
    .where("order_id", "in", [...orderIds])
    .execute();
}
