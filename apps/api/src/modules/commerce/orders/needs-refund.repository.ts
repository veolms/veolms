import { sql } from "kysely";
import type { Executor } from "../shared/repository.types.ts";
import { MANUAL_PAYMENT_ID_PREFIX } from "../payments/manual-payment.repository.ts";
import { SURPLUS_CAPTURE_ERROR_CODE } from "../payments/surplus-payment.ts";

/**
 * Where a page of the list ends: the last entry's time (Postgres text, so
 * its microseconds survive) and id. The next page is everything before it.
 */
export interface NeedsRefundCursor {
  paidAt: string;
  id: string;
}

interface NeedsRefundPage {
  cursor?: NeedsRefundCursor;
  limit: number;
}

/** A `timestamptz` column as text, exact to the microsecond. */
const cursorText = (column: string) =>
  sql<string>`to_char(${sql.ref(column)} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

/**
 * Who the listed buyers are. Just the columns the list shows: the avatar
 * the orders table loads is left out, it is not shown here.
 */
export async function listBuyersByIds(database: Executor, userIds: string[]) {
  if (userIds.length === 0) return [];
  return await database
    .selectFrom("users")
    .select(["id", "display_name", "username", "email"])
    .where("id", "in", userIds)
    .execute();
}

export interface SurplusPaymentToReturnRow {
  id: string;
  order_id: string;
  order_number: string;
  user_id: string;
  /** Minor units, like every payment amount. */
  amount: number;
  currency: string;
  gateway_provider: string;
  gateway_payment_id: string | null;
  error_description: string | null;
  item_titles: string | null;
  paid_at: Date;
  paid_at_cursor: string;
}

/**
 * Surplus payments still to be returned (see payments/surplus-payment.ts),
 * newest first. `paid_at` is when the capture was recorded: the captured
 * attempt's time, because the payment row's own `updated_at` moves again
 * each time a part refund is noted on it.
 */
export async function listSurplusPaymentsToReturn(
  database: Executor,
  { cursor, limit }: NeedsRefundPage,
): Promise<SurplusPaymentToReturnRow[]> {
  const result = await sql<SurplusPaymentToReturnRow>`
    select s.*, ${cursorText("s.paid_at")} as paid_at_cursor
    from (
      select
        p.id,
        p.order_id,
        o.order_number,
        o.user_id,
        p.amount,
        p.currency,
        p.gateway_provider,
        p.gateway_payment_id,
        p.error_description,
        (
          select string_agg(oi.title_snapshot, ', ' order by oi.created_at, oi.id)
          from order_items oi
          where oi.order_id = o.id
        ) as item_titles,
        coalesce(
          (
            select max(pa.created_at)
            from payment_attempts pa
            where pa.payment_id = p.id and pa.status = 'captured'
          ),
          p.updated_at
        ) as paid_at
      from payments p
      join orders o on o.id = p.order_id
      where p.error_code = ${SURPLUS_CAPTURE_ERROR_CODE}
        and p.status = 'captured'
    ) s
    where ${
      cursor
        ? sql`(s.paid_at, s.id) < (${cursor.paidAt}::timestamptz, ${cursor.id}::uuid)`
        : sql`true`
    }
    order by s.paid_at desc, s.id desc
    limit ${limit}
  `.execute(database);
  return result.rows;
}

/** Order statuses in which the order was paid, by some other payment. */
const PAID_ORDER_STATUSES = ["paid", "partially_refunded", "refunded"] as const;

/**
 * Order statuses that were never paid and cannot be paid any more:
 * verifying a transfer for one is refused (order.repository.ts's
 * markOrderPaidIfPending takes `pending`, `payment_processing` and
 * `expired` only).
 */
export const CLOSED_UNPAID_ORDER_STATUSES = [
  "cancelled",
  "payment_failed",
] as const;
export type ClosedUnpaidOrderStatus =
  (typeof CLOSED_UNPAID_ORDER_STATUSES)[number];

export interface StuckManualTransferRow {
  /** The manual payment request. */
  id: string;
  order_id: string;
  order_number: string;
  /** Why the request can no longer be verified. */
  order_status: (typeof PAID_ORDER_STATUSES)[number] | ClosedUnpaidOrderStatus;
  user_id: string;
  /** Minor units, as order columns are stored. */
  total_amount: number;
  currency: string;
  payment_method: string;
  transaction_reference: string;
  item_titles: string | null;
  submitted_at: Date;
  /** This row's place in the list: when the request was submitted. */
  paid_at_cursor: string;
}

/**
 * Reported transfers that can no longer be verified, newest first by when
 * they were reported: manual payment requests still `pending`, or
 * `withdrawn` by the buyer, whose order will not take a payment any more.
 * Two ways that happens:
 *
 *  - the order was paid another way (`paid`, `partially_refunded` or
 *    `refunded`). A pending request has paid for nothing, so whatever paid
 *    the order was a different payment;
 *  - the order was closed without being paid (`cancelled` or
 *    `payment_failed`). Nothing was granted for it.
 *
 * Either way verifying the request is refused from then on, so it would
 * wait for good; and if the buyer did send the transfer, the academy holds
 * it with no row to show for it. `order_status` says which of the two it is.
 *
 * What counts, and why:
 *
 *  - Only `pending` requests, and ones the buyer took back (`withdrawn`).
 *    Rejecting one (the review action that already exists) is how staff say
 *    it has been dealt with, and takes it off the list. A verified one is
 *    the payment that paid its order.
 *  - A withdrawn request counts because withdrawing says only that the
 *    buyer no longer wants the order paid by it; the money may have been
 *    sent all the same. Once the order was paid another way or closed,
 *    staff check their bank, return the transfer if it arrived, and reject
 *    the request. While its order is still open it is not listed: the buyer
 *    can report the transfer again.
 *  - Not an order that is still open (`pending`, `payment_processing`) or
 *    has only run out of time (`expired`): verifying the request still pays
 *    that order. That is the ordinary review queue, not money to return.
 *  - A refunded order still counts: the refund returned the other payment,
 *    not this transfer.
 *  - Not a request whose reference is already recorded as a verified manual
 *    payment, for this order or any other, compared as the verify step
 *    compares it (payment.repository.ts's findManualPaymentByReference).
 *    One reference is one transfer, and that transfer is on a payment row.
 *
 * How it is read: in two steps inside one statement, on purpose. `waiting`
 * is found first, from the pending requests (there is an index on the
 * status) and each one's order by its key, so its cost follows the review
 * queue. Only those rows have their references looked up among the manual
 * payments, which is a pass over the payments table: there is no index on
 * a reference as the verify step compares it. Written as one join, that
 * pass was made on every request, with the queue's whole length to compare
 * and usually nothing to find; kept apart, it is not made at all while no
 * request is waiting on a paid order.
 */
export async function listStuckManualTransfers(
  database: Executor,
  { cursor, limit }: NeedsRefundPage,
): Promise<StuckManualTransferRow[]> {
  const stuckOrderStatuses = [
    ...PAID_ORDER_STATUSES,
    ...CLOSED_UNPAID_ORDER_STATUSES,
  ];
  const result = await sql<StuckManualTransferRow>`
    with waiting as materialized (
      select
        m.id,
        m.order_id,
        o.order_number,
        o.status as order_status,
        o.user_id,
        o.total_amount,
        o.currency,
        m.payment_method,
        m.transaction_reference,
        m.created_at as submitted_at
      from manual_payment_requests m
      join orders o on o.id = m.order_id
      where m.status in ('pending', 'withdrawn')
        and o.status = any(${stuckOrderStatuses}::text[])
        and ${
          cursor
            ? sql`(m.created_at, m.id) < (${cursor.paidAt}::timestamptz, ${cursor.id}::uuid)`
            : sql`true`
        }
    )
    select
      w.*,
      (
        select string_agg(oi.title_snapshot, ', ' order by oi.created_at, oi.id)
        from order_items oi
        where oi.order_id = w.order_id
      ) as item_titles,
      ${cursorText("w.submitted_at")} as paid_at_cursor
    from waiting w
    where not exists (
      select 1
      from payments p
      where p.gateway_provider = 'manual'
        and upper(regexp_replace(p.gateway_payment_id, '[[:space:]]+', '', 'g'))
          = upper(${MANUAL_PAYMENT_ID_PREFIX}::text || regexp_replace(w.transaction_reference, '[[:space:]]+', '', 'g'))
    )
    order by w.submitted_at desc, w.id desc
    limit ${limit}
  `.execute(database);
  return result.rows;
}

/** What the two kinds of duplicate have in common: the two orders. */
interface DuplicateOrdersRow {
  user_id: string;
  currency: string;
  /** The later-paid order: the one to refund. */
  order_id: string;
  order_number: string;
  /** Minor units, as order and item columns are stored. */
  final_amount: number;
  /** Minor units. */
  total_amount: number;
  paid_at: Date;
  paid_at_cursor: string;
  earlier_order_id: string;
  earlier_order_number: string;
  /** Minor units. */
  earlier_final_amount: number;
  earlier_paid_at: Date;
  /**
   * Every processed refund on the later order. Minor units, like every
   * refund amount. Text: a Postgres bigint.
   */
  refunded_amount: string;
  gateway_provider: string | null;
  gateway_payment_id: string | null;
}

export interface DuplicatePurchaseRow extends DuplicateOrdersRow {
  /**
   * The later order's item for the course; when that item is a bundle, the
   * record of it granting this course (one bundle item, several courses).
   */
  id: string;
  /** The later order's item that holds the course. */
  order_item_id: string;
  course_id: string;
  /** The course's name: as the order names it, for a course item. */
  title_snapshot: string;
  /** Set when the later order holds the course inside a bundle. */
  bundle_title: string | null;
  /** Set when the earlier order holds the course inside a bundle. */
  earlier_bundle_title: string | null;
  /**
   * Processed refunds on the later order that were not made against one of
   * its items. Minor units, as text.
   */
  order_level_refunded_amount: string;
}

export interface DuplicateBundlePurchaseRow extends DuplicateOrdersRow {
  /** The later order's item for the bundle. */
  id: string;
  bundle_id: string;
  /** The bundle's name, as the later order names it. */
  title_snapshot: string;
}

export interface DuplicatePurchases {
  /** One course granted by two paid orders. */
  courses: DuplicatePurchaseRow[];
  /** One bundle held by two paid orders. */
  bundles: DuplicateBundlePurchaseRow[];
}

/**
 * Leaves out refunds of an extra payment where an order's refunds are added
 * up: that money was never part of what the order was paid with (see
 * order.repository.ts). For a query that names the refunds table `r`.
 */
const notOfExtraPayment = sql`not exists (
            select 1 from payments xp
            where xp.id = r.payment_id
              and xp.error_code = ${SURPLUS_CAPTURE_ERROR_CODE}
          )`;

/** An item that has been refunded, or has a refund under way. */
const itemRefunded = (itemId: string) => sql`
  exists (
    select 1
    from refunds r
    where r.order_item_id = ${sql.ref(itemId)}
      and r.status in ('pending', 'processed')
  )`;

/**
 * What both duplicate queries end with: the later order's refunds so far and
 * the payment that paid it. Reads from a CTE named `later`.
 */
const laterOrderMoney = sql`
      (
        select coalesce(sum(r.amount), 0)::bigint
        from refunds r
        where r.order_id = later.order_id and r.status = 'processed'
          and ${notOfExtraPayment}
      ) as refunded_amount,
      pay.gateway_provider,
      pay.gateway_payment_id
    from later
    left join lateral (
      select p.gateway_provider, p.gateway_payment_id
      from payments p
      where p.order_id = later.order_id
        and p.status = 'captured'
        and p.error_code is distinct from ${SURPLUS_CAPTURE_ERROR_CODE}
      order by p.created_at desc, p.id desc
      limit 1
    ) pay on true`;

/**
 * Duplicate purchases, newest first: a buyer holding two orders, each paid
 * (`paid` or `partially_refunded`), that both granted the same course
 * (`courses`) or both contain the same bundle (`bundles`). One row per
 * later order's course or bundle; `earlier_*` is the order holding it that
 * was paid just before. (A course paid for three times gives two rows: the
 * second order against the first, the third against the second.)
 *
 * What counts, and why:
 *
 *  - Courses are compared through `order_item_courses`, the note written
 *    when an order is fulfilled of which courses each of its items granted
 *    (course-access.service.ts's grantAccessForOrder): a course item's
 *    course, and every course a bundle item held at that moment. So a
 *    course bought on its own and again inside a bundle, or inside two
 *    different bundles, is a duplicate, and a bundle that was edited after
 *    it was sold is compared as it was sold. `course_bundle_items` is the
 *    bundle as it is today and is not used.
 *  - A bundle order paid before that note existed has no rows (what it was
 *    sold with is not known) and is not compared course by course.
 *  - Bundles are compared by `order_items.bundle_id` alone, which every
 *    order has, whatever its age.
 *  - An item that has itself been refunded (or has a refund under way) no
 *    longer holds the course, exactly as in order.repository.ts's
 *    findOtherPaidOrderCoveringCourse. A fully refunded order is not
 *    `paid`, so it is out as well.
 *  - The later order must have been created before the earlier one was
 *    paid: both were open at once. That is the only way one course gets
 *    paid for twice by accident. Once an order is paid the buyer holds the
 *    course, and checkout refuses to create or continue another order for
 *    it (for a bundle: once every course in it is held); an order created
 *    after that means the buyer chose to buy again, which is not money to
 *    return.
 *  - A later item that cost nothing leaves nothing to return.
 *
 * The two lists overlap on purpose: two orders holding the same bundle are
 * in `bundles` once and, when both have their notes, in `courses` once per
 * course of the bundle. Which of those to show is not decided here (see
 * needs-refund.mapper.ts's withoutCoursesOfDuplicateBundles).
 *
 * How it is read: in two steps, on purpose. Comparing every paid order's
 * items with every other's is a join over the whole orders table, so the
 * first step (listOverlappingPaidOrderIds) looks at orders alone and keeps
 * the few that can be the later half of a duplicate. Only those have their
 * items compared here, through the buyer and order indexes. As one
 * statement the planner could not know how few they are, planned the
 * second step for a third of all orders, and spent most of a second
 * preparing a plan it then ran for a handful of rows.
 *
 * All of them are returned, not a page: there are only ever as many as
 * there were double payments, and which of them are still owed is decided
 * from the amounts (needs-refund.mapper.ts's isDuplicateStillOwed), which
 * needs each order's currency.
 *
 * Pass `userId` to look at one buyer only (the check made when an order is
 * paid); that reads the buyer's orders through the (user_id, status) index.
 */
export async function listDuplicatePurchases(
  database: Executor,
  { userId }: { userId?: string } = {},
): Promise<DuplicatePurchases> {
  const candidateOrderIds = await listOverlappingPaidOrderIds(database, userId);
  if (candidateOrderIds.length === 0) return { courses: [], bundles: [] };

  const courses = await sql<DuplicatePurchaseRow>`
    with later as (
      select
        case when oi.item_type = 'course' then oi.id else oic.id end as id,
        oi.id as order_item_id,
        oic.course_id,
        case
          when oi.item_type = 'course' then oi.title_snapshot
          else c.title
        end as title_snapshot,
        case
          when oi.item_type = 'bundle' then oi.title_snapshot
        end as bundle_title,
        oi.final_amount,
        o.id as order_id,
        o.order_number,
        o.user_id,
        o.currency,
        o.total_amount,
        coalesce(o.paid_at, o.created_at) as paid_at,
        earlier.order_id as earlier_order_id,
        earlier.order_number as earlier_order_number,
        earlier.final_amount as earlier_final_amount,
        earlier.bundle_title as earlier_bundle_title,
        earlier.paid_at as earlier_paid_at
      from orders o
      join order_items oi on oi.order_id = o.id
      join order_item_courses oic on oic.order_item_id = oi.id
      join courses c on c.id = oic.course_id
      join lateral (
        -- The order that granted this course and was paid just before.
        select
          e.id as order_id,
          e.order_number,
          ei.final_amount,
          case
            when ei.item_type = 'bundle' then ei.title_snapshot
          end as bundle_title,
          coalesce(e.paid_at, e.created_at) as paid_at
        from order_item_courses eic
        join orders e on e.id = eic.order_id
        join order_items ei on ei.id = eic.order_item_id
        where eic.user_id = o.user_id
          and eic.course_id = oic.course_id
          and e.id <> o.id
          and e.status in ('paid', 'partially_refunded')
          and (coalesce(e.paid_at, e.created_at), e.created_at, e.id)
            < (coalesce(o.paid_at, o.created_at), o.created_at, o.id)
          and not ${itemRefunded("ei.id")}
        order by
          coalesce(e.paid_at, e.created_at) desc,
          e.created_at desc,
          e.id desc,
          -- One order holding the course twice: its course item speaks.
          ei.item_type = 'course' desc,
          ei.id
        limit 1
      ) earlier on true
      where o.id = any(${candidateOrderIds}::uuid[])
        and o.status in ('paid', 'partially_refunded')
        and oi.final_amount > 0
        and o.created_at < earlier.paid_at
        and not ${itemRefunded("oi.id")}
    )
    select
      later.id,
      later.order_item_id,
      later.course_id,
      later.title_snapshot,
      later.bundle_title,
      later.user_id,
      later.currency,
      later.order_id,
      later.order_number,
      later.final_amount,
      later.total_amount,
      later.paid_at,
      ${cursorText("later.paid_at")} as paid_at_cursor,
      later.earlier_order_id,
      later.earlier_order_number,
      later.earlier_final_amount,
      later.earlier_bundle_title,
      later.earlier_paid_at,
      (
        select coalesce(sum(r.amount), 0)::bigint
        from refunds r
        where r.order_id = later.order_id
          and r.status = 'processed'
          and r.order_item_id is null
          and ${notOfExtraPayment}
      ) as order_level_refunded_amount,
      ${laterOrderMoney}
    order by later.paid_at desc, later.id desc
  `.execute(database);

  const bundles = await sql<DuplicateBundlePurchaseRow>`
    with later as (
      select
        oi.id,
        oi.bundle_id,
        oi.title_snapshot,
        oi.final_amount,
        o.id as order_id,
        o.order_number,
        o.user_id,
        o.currency,
        o.total_amount,
        coalesce(o.paid_at, o.created_at) as paid_at,
        earlier.order_id as earlier_order_id,
        earlier.order_number as earlier_order_number,
        earlier.final_amount as earlier_final_amount,
        earlier.paid_at as earlier_paid_at
      from orders o
      join order_items oi on oi.order_id = o.id
      join lateral (
        -- The order holding this bundle that was paid just before.
        select
          e.id as order_id,
          e.order_number,
          ei.final_amount,
          coalesce(e.paid_at, e.created_at) as paid_at
        from orders e
        join order_items ei on ei.order_id = e.id
        where e.user_id = o.user_id
          and e.id <> o.id
          and e.status in ('paid', 'partially_refunded')
          and ei.item_type = 'bundle'
          and ei.bundle_id = oi.bundle_id
          and (coalesce(e.paid_at, e.created_at), e.created_at, e.id)
            < (coalesce(o.paid_at, o.created_at), o.created_at, o.id)
          and not ${itemRefunded("ei.id")}
        order by
          coalesce(e.paid_at, e.created_at) desc,
          e.created_at desc,
          e.id desc,
          ei.id
        limit 1
      ) earlier on true
      where o.id = any(${candidateOrderIds}::uuid[])
        and o.status in ('paid', 'partially_refunded')
        and oi.item_type = 'bundle'
        and oi.bundle_id is not null
        and oi.final_amount > 0
        and o.created_at < earlier.paid_at
        and not ${itemRefunded("oi.id")}
    )
    select
      later.id,
      later.bundle_id,
      later.title_snapshot,
      later.user_id,
      later.currency,
      later.order_id,
      later.order_number,
      later.final_amount,
      later.total_amount,
      later.paid_at,
      ${cursorText("later.paid_at")} as paid_at_cursor,
      later.earlier_order_id,
      later.earlier_order_number,
      later.earlier_final_amount,
      later.earlier_paid_at,
      ${laterOrderMoney}
    order by later.paid_at desc, later.id desc
  `.execute(database);

  return { courses: courses.rows, bundles: bundles.rows };
}

/**
 * The paid orders that were still unpaid when the same buyer's previously
 * paid order (for anything) was paid: created before it, paid after it.
 * Every duplicate purchase's later order is one of these, and very few
 * orders are; a buyer's orders normally follow one another. Reads the
 * orders table only.
 */
async function listOverlappingPaidOrderIds(
  database: Executor,
  userId?: string,
): Promise<string[]> {
  const result = await sql<{ id: string }>`
    select paid.id
    from (
      select
        o.id,
        o.created_at,
        lag(coalesce(o.paid_at, o.created_at)) over (
          partition by o.user_id
          order by coalesce(o.paid_at, o.created_at), o.created_at, o.id
        ) as previous_paid_at
      from orders o
      where o.status in ('paid', 'partially_refunded')
        and ${userId ? sql`o.user_id = ${userId}::uuid` : sql`true`}
    ) paid
    where paid.created_at < paid.previous_paid_at
  `.execute(database);
  return result.rows.map((row) => row.id);
}
