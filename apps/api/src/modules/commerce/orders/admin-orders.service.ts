import type {
  OrderCourseOptionsResponse,
  OrderFilterMode,
  OrderKind,
  OrderScope,
  OrderStatsResponse,
  OrderStatus,
} from "@veolms/contracts";
import { toMinorUnits } from "@veolms/contracts";
import type { Executor } from "../shared/repository.types.ts";
import type { AdminOrderFilters } from "./order-filters.sql.ts";
import * as adminRepo from "./admin-orders.repository.ts";

/** The filter fields the orders list, stats and export queries carry. */
export interface AdminOrderFilterQuery {
  status?: OrderStatus;
  statuses?: OrderStatus[];
  statusMode?: OrderFilterMode;
  courseId?: string;
  courseIds?: string[];
  courseMode?: OrderFilterMode;
  couponId?: string;
  couponIds?: string[];
  couponMode?: OrderFilterMode;
  kind?: OrderKind;
  from?: Date;
  to?: Date;
  search?: string;
}

/**
 * The validated query as one filter. The older single-value fields
 * (`status`, `courseId`, `couponId`) still work: each joins its list, and a
 * single `status` given with `statuses` narrows to what both allow.
 */
export function toAdminOrderFilters(
  query: AdminOrderFilterQuery,
): AdminOrderFilters {
  let statuses = query.statuses;
  let matchNothing = false;
  if (query.status) {
    statuses = statuses
      ? statuses.filter((status) => status === query.status)
      : [query.status];
    // Nothing both allow: no order can match.
    matchNothing = statuses.length === 0;
  }
  const merge = (one?: string, many?: string[]) =>
    one ? [...new Set([...(many ?? []), one])] : many;

  return {
    ...(matchNothing ? { matchNothing } : {}),
    statuses,
    statusMode: query.statusMode ?? "include",
    courseIds: merge(query.courseId, query.courseIds),
    courseMode: query.courseMode ?? "include",
    couponIds: merge(query.couponId, query.couponIds),
    couponMode: query.couponMode ?? "include",
    kind: query.kind,
    from: query.from,
    to: query.to,
    search: query.search,
  };
}

/** A stable cache key part for `filters`. */
export function adminFiltersKey(filters: AdminOrderFilters): string {
  return JSON.stringify([
    filters.matchNothing ?? false,
    filters.statuses,
    filters.statusMode,
    filters.courseIds ? [...filters.courseIds].sort() : null,
    filters.courseMode,
    filters.couponIds ? [...filters.couponIds].sort() : null,
    filters.couponMode,
    filters.kind,
    filters.from?.toISOString(),
    filters.to?.toISOString(),
    filters.search?.trim().toLowerCase(),
  ]);
}

/** What the Orders screen's statistics add to the existing figures. */
export async function getAdminStatsAdditions(
  database: Executor,
  scope: OrderScope,
  filters: AdminOrderFilters,
  currency: string,
): Promise<
  Pick<
    OrderStatsResponse,
    | "attempts"
    | "successfulAttempts"
    | "discountTotal"
    | "repeatBuyers"
    | "refundedOrders"
    | "free"
  >
> {
  const [extra, discounts, free] = await Promise.all([
    adminRepo.getAdminOrderExtraStats(database, scope, filters),
    adminRepo.getAdminOrderDiscountTotals(database, scope, filters),
    filters.kind === "free"
      ? adminRepo.getFreeOrderStats(database, scope, filters)
      : Promise.resolve(undefined),
  ]);
  return {
    ...extra,
    discountTotal: discounts.get(currency) ?? 0,
    ...(free ? { free } : {}),
  };
}

/**
 * The courses the Orders screen filters by, each with whether it is free,
 * its price in minor units and its picture.
 */
export async function listOrderCourseOptions(
  database: Executor,
  courseCards?: (
    courseIds: readonly string[],
  ) => Promise<ReadonlyArray<{ id: string; thumbnailUrl: string | null }>>,
): Promise<OrderCourseOptionsResponse> {
  const rows = await adminRepo.listOrderCourseOptions(database);
  let pictures = new Map<string, string | null>();
  if (courseCards && rows.length > 0) {
    try {
      const cards = await courseCards(rows.map((row) => row.id));
      pictures = new Map(cards.map((card) => [card.id, card.thumbnailUrl]));
    } catch {
      // Pictures only dress the list; the stored URL stands in.
    }
  }
  return {
    courses: rows.map((row) => {
      const currency = row.currency ?? "INR";
      const isFree = row.pricing_type !== "paid" || !row.sale_price;
      return {
        id: row.id,
        title: row.title,
        isFree,
        // Catalogue prices are whole major units.
        price: isFree ? 0 : toMinorUnits(Number(row.sale_price), currency),
        currency,
        thumbnailUrl: pictures.get(row.id) ?? row.thumbnail_url ?? null,
      };
    }),
  };
}
