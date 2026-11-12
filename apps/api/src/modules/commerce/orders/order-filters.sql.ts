import { sql, type RawBuilder } from "kysely";
import type { OrderStatus } from "@veolms/database";
import type { OrderFilterMode, OrderKind, OrderScope } from "@veolms/contracts";
import { escapeLikePattern } from "../../../lib/like-pattern.ts";
import { fuzzyMatchesAny } from "../../../lib/fuzzy-search.ts";

/**
 * The academy Orders screen's filters, as the orders list, its statistics and
 * its CSV export all apply them. Each list is either kept (`include`) or left
 * out (`exclude`); an empty or missing list is no filter.
 */
export interface AdminOrderFilters {
  statuses?: readonly OrderStatus[];
  statusMode?: OrderFilterMode;
  courseIds?: readonly string[];
  courseMode?: OrderFilterMode;
  couponIds?: readonly string[];
  couponMode?: OrderFilterMode;
  kind?: OrderKind;
  from?: Date;
  to?: Date;
  search?: string;
  /** Set when the filters contradict each other: no order matches. */
  matchNothing?: boolean;
}

/**
 * The conditions on `orders as o` for `filters`, to be ANDed together. Kept
 * as plain SQL fragments so every query (list, count, stats, export) shares
 * them exactly.
 */
export function adminOrderConditions(
  scope: OrderScope,
  filters: AdminOrderFilters,
): RawBuilder<boolean>[] {
  const conditions: RawBuilder<boolean>[] = [];

  if (scope.type === "user") {
    conditions.push(sql<boolean>`o.user_id = ${scope.id}::uuid`);
  }
  if (filters.matchNothing) {
    conditions.push(sql<boolean>`false`);
  }

  const statuses = filters.statuses ?? [];
  if (statuses.length > 0) {
    const list = sql.join(statuses.map((status) => sql`${status}`));
    conditions.push(
      filters.statusMode === "exclude"
        ? sql<boolean>`o.status not in (${list})`
        : sql<boolean>`o.status in (${list})`,
    );
  }

  const courseIds = filters.courseIds ?? [];
  if (courseIds.length > 0) {
    const hasCourse = sql`exists (
      select 1 from order_items oi
      where oi.order_id = o.id
        and oi.course_id = any(${[...courseIds]}::uuid[])
    )`;
    conditions.push(
      filters.courseMode === "exclude"
        ? sql<boolean>`not ${hasCourse}`
        : sql<boolean>`${hasCourse}`,
    );
  }

  const couponIds = filters.couponIds ?? [];
  if (couponIds.length > 0) {
    conditions.push(
      filters.couponMode === "exclude"
        ? sql<boolean>`(o.coupon_id is null or not (o.coupon_id = any(${[...couponIds]}::uuid[])))`
        : sql<boolean>`o.coupon_id = any(${[...couponIds]}::uuid[])`,
    );
  }

  // A coupon taking the whole price off still leaves a paid order: what was
  // sold had a price before discounts.
  if (filters.kind === "paid") {
    conditions.push(sql<boolean>`o.subtotal_amount > 0`);
  } else if (filters.kind === "free") {
    conditions.push(sql<boolean>`o.subtotal_amount = 0`);
  }

  if (filters.from) {
    conditions.push(sql<boolean>`o.created_at >= ${filters.from}`);
  }
  if (filters.to) {
    conditions.push(sql<boolean>`o.created_at <= ${filters.to}`);
  }

  const search = filters.search?.trim();
  if (search && scope.type === "academy") {
    // "%" and "_" mean "anything" to ILIKE, so they are escaped.
    const term = `%${escapeLikePattern(search)}%`;
    conditions.push(sql<boolean>`(
      o.order_number ilike ${term}
      or o.invoice_number ilike ${term}
      or exists (
        select 1 from users u
        where u.id = o.user_id
          and (
            u.display_name ilike ${term}
            or u.username ilike ${term}
            or u.email ilike ${term}
            or ${fuzzyMatchesAny(search, [
              sql.ref("u.display_name"),
              sql.ref("u.username"),
            ])}
          )
      )
    )`);
  }

  return conditions;
}

/** `conditions` ANDed into one; `true` when there are none. */
export function allOf(conditions: RawBuilder<boolean>[]): RawBuilder<boolean> {
  return conditions.length === 0
    ? sql<boolean>`true`
    : sql<boolean>`(${sql.join(conditions, sql` and `)})`;
}
