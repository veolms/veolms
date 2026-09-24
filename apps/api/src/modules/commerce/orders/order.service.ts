import type {
  Order,
  OrdersListResponse,
  OrdersListQuery,
  OrderScope,
  OrderStatsQuery,
  OrderStatsResponse,
  OrderAdminDetails,
} from "@veolms/contracts";
import { decodeOrderCursor, encodeOrderCursor } from "@veolms/contracts";
import type { Executor } from "../shared/repository.types.ts";
import { CommerceErrors } from "../shared/commerce.errors.ts";
import { AppError } from "../../../lib/errors.ts";
import * as orderRepo from "./order.repository.ts";
import * as setupRepo from "../../auth/setup/setup.repository.ts";
import { toOrderAdminDetails, toOrderContract } from "./order.mapper.ts";

export interface OrderService {
  getOrderById(scope: OrderScope, orderId: string): Promise<Order>;
  listOrders(
    scope: OrderScope,
    options: OrdersListQuery,
  ): Promise<OrdersListResponse>;
  getOrderStats(
    scope: OrderScope,
    filters: OrderStatsQuery,
  ): Promise<OrderStatsResponse>;
  /**
   * Day-bucketed net revenue for the currency `getOrderStats` would resolve
   * for the same filters — callers needing both a trend and its totals
   * (dashboards) should call getOrderStats first and pass its `currency`
   * here, so the two agree on which currency is being shown.
   */
  getRevenueTrend(
    scope: OrderScope,
    filters: orderRepo.RevenueTrendFilters,
  ): Promise<orderRepo.RevenueTrendPoint[]>;
  /** The raw per-currency row (exposes grossPaid, which the derived
   * OrderStatsResponse above intentionally doesn't) for the currency that
   * would be resolved for these filters. */
  getRawStatsForCourses(
    scope: OrderScope,
    filters: {
      courseId?: string | string[];
      from?: Date;
      to?: Date;
      currency?: string;
    },
  ): Promise<orderRepo.OrderStatsRow>;
  getOrderStatusFunnel(
    scope: OrderScope,
    filters: { from?: Date; to?: Date; courseId?: string | string[] },
  ): Promise<{ created: number; paid: number; refunded: number }>;
  /** The scope admin-view requests run under (single academy per deployment). */
  getAcademyScope(): Promise<OrderScope>;
}

const STATS_CACHE_TTL_MS = 30_000;
const STATS_CACHE_MAX_ENTRIES = 200;

export function createOrderService({
  database,
}: {
  database: Executor;
}): OrderService {
  const statsCache = new Map<
    string,
    { expiresAt: number; value: Promise<OrderStatsResponse> }
  >();

  async function getOrderById(
    scope: OrderScope,
    orderId: string,
  ): Promise<Order> {
    const order = await orderRepo.findOrderById(database, orderId, scope);
    if (!order) {
      throw CommerceErrors.ORDER_NOT_FOUND(orderId);
    }

    // Defensive assertion in service layer
    if (scope.type === "user" && order.user_id !== scope.id) {
      throw CommerceErrors.ORDER_NOT_FOUND(orderId);
    }

    const items = await orderRepo.listOrderItems(database, order.id);

    let adminDetails: OrderAdminDetails | undefined;
    if (scope.type === "academy") {
      const [users, coupons, payments, refunds] = await Promise.all([
        orderRepo.listUsersByIds(database, [order.user_id]),
        order.coupon_id
          ? orderRepo.listCouponsByIds(database, [order.coupon_id])
          : Promise.resolve([]),
        orderRepo.listPaymentsByOrderIds(database, [order.id]),
        orderRepo.listRefundsByOrderIds(database, [order.id]),
      ]);

      // Payments arrive best-ranked first (see listPaymentsByOrderIds).
      adminDetails = toOrderAdminDetails({
        order,
        user: users[0],
        coupon: coupons[0],
        payment: payments[0],
        refunds,
      });
    }

    return toOrderContract(order, items, { admin: adminDetails });
  }

  async function listOrders(
    scope: OrderScope,
    options: OrdersListQuery,
  ): Promise<OrdersListResponse> {
    const { limit, sortOrder } = options;

    let decodedCursor;
    if (options.cursor) {
      try {
        decodedCursor = decodeOrderCursor(options.cursor, sortOrder);
      } catch (err: unknown) {
        throw new AppError(
          400,
          "INVALID_CURSOR",
          err instanceof Error ? err.message : "The pagination cursor is invalid.",
        );
      }
    }

    const rows = await orderRepo.listOrders(database, scope, {
      cursor: decodedCursor,
      limit,
      search: options.search,
      courseId: options.courseId,
      couponId: options.couponId,
      status: options.status,
      from: options.from,
      to: options.to,
      sortOrder,
    });

    const hasNextPage = rows.length > limit;
    const pageRows = hasNextPage ? rows.slice(0, limit) : rows;

    if (pageRows.length === 0) {
      return { orders: [], nextCursor: null };
    }

    const orderIds = pageRows.map((o) => o.id);
    const userIds = [...new Set(pageRows.map((o) => o.user_id))];
    const couponIds = [
      ...new Set(
        pageRows.map((o) => o.coupon_id).filter((id): id is string => Boolean(id)),
      ),
    ];

    // Batch load relations in parallel
    const [allItems, users, coupons, payments, refunds] = await Promise.all([
      orderRepo.listOrderItemsByOrderIds(database, orderIds),
      scope.type === "academy"
        ? orderRepo.listUsersByIds(database, userIds)
        : Promise.resolve([]),
      scope.type === "academy" && couponIds.length > 0
        ? orderRepo.listCouponsByIds(database, couponIds)
        : Promise.resolve([]),
      scope.type === "academy"
        ? orderRepo.listPaymentsByOrderIds(database, orderIds)
        : Promise.resolve([]),
      scope.type === "academy"
        ? orderRepo.listRefundsByOrderIds(database, orderIds)
        : Promise.resolve([]),
    ]);

    // Index batch loaded relations
    const itemsByOrderId = new Map<string, typeof allItems>();
    for (const item of allItems) {
      const list = itemsByOrderId.get(item.order_id) ?? [];
      list.push(item);
      itemsByOrderId.set(item.order_id, list);
    }

    const usersById = new Map<string, (typeof users)[0]>();
    for (const u of users) {
      usersById.set(u.id, u);
    }

    const couponsById = new Map<string, (typeof coupons)[0]>();
    for (const c of coupons) {
      couponsById.set(c.id, c);
    }

    // Rows arrive best-ranked first per order (see listPaymentsByOrderIds);
    // keep that one so the list agrees with the detail view.
    const paymentsByOrderId = new Map<string, (typeof payments)[0]>();
    for (const p of payments) {
      if (!paymentsByOrderId.has(p.order_id)) {
        paymentsByOrderId.set(p.order_id, p);
      }
    }

    const refundsByOrderId = new Map<string, typeof refunds>();
    for (const r of refunds) {
      const list = refundsByOrderId.get(r.order_id) ?? [];
      list.push(r);
      refundsByOrderId.set(r.order_id, list);
    }

    const orders = pageRows.map((order) => {
      const items = itemsByOrderId.get(order.id) ?? [];

      const adminDetails =
        scope.type === "academy"
          ? toOrderAdminDetails({
              order,
              user: usersById.get(order.user_id),
              coupon: order.coupon_id ? couponsById.get(order.coupon_id) : undefined,
              payment: paymentsByOrderId.get(order.id),
              refunds: refundsByOrderId.get(order.id) ?? [],
            })
          : undefined;

      return toOrderContract(order, items, { admin: adminDetails });
    });

    const lastOrder = pageRows[pageRows.length - 1]!;
    const nextCursor = hasNextPage
      ? encodeOrderCursor({
          id: lastOrder.id,
          // Full-precision text from Postgres, not `created_at.toISOString()`,
          // which would drop the microseconds the seek predicate compares on.
          createdAt: lastOrder.created_at_cursor,
          sortOrder,
        })
      : null;

    return { orders, nextCursor };
  }

  async function getOrderStats(
    scope: OrderScope,
    filters: OrderStatsQuery,
  ): Promise<OrderStatsResponse> {
    const requestedCurrency = filters.currency?.toUpperCase();
    const normalized = {
      courseId: filters.courseId,
      couponId: filters.couponId,
      status: filters.status,
      from: filters.from,
      to: filters.to,
    };

    // Dashboards poll this and each call is an aggregate over every matching
    // order, so results are shared briefly and concurrent identical calls
    // share one query. Figures can trail a new order or refund by up to the
    // TTL; failures are never cached.
    const cacheKey = JSON.stringify([
      scope.type,
      scope.id,
      requestedCurrency,
      normalized.courseId,
      normalized.couponId,
      normalized.status,
      normalized.from?.toISOString(),
      normalized.to?.toISOString(),
    ]);
    const now = Date.now();
    const cached = statsCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return await cached.value;
    }

    const value = computeOrderStats(scope, normalized, requestedCurrency);
    statsCache.set(cacheKey, { expiresAt: now + STATS_CACHE_TTL_MS, value });
    void value.catch(() => {
      if (statsCache.get(cacheKey)?.value === value) {
        statsCache.delete(cacheKey);
      }
    });
    pruneStatsCache(now);
    return await value;
  }

  async function computeOrderStats(
    scope: OrderScope,
    filters: orderRepo.OrderStatsFilters,
    requestedCurrency: string | undefined,
  ): Promise<OrderStatsResponse> {
    const rows = await orderRepo.getOrderStatsByCurrency(
      database,
      scope,
      filters,
    );
    const selected = requestedCurrency
      ? rows.find((row) => row.currency === requestedCurrency)
      : [...rows].sort(
          (a, b) =>
            b.totalOrders - a.totalOrders || a.currency.localeCompare(b.currency),
        )[0];

    return {
      netRevenue: selected ? selected.grossPaid - selected.refundedAmount : 0,
      totalOrders: selected?.totalOrders ?? 0,
      uniqueBuyers: selected?.uniqueBuyers ?? 0,
      refundedAmount: selected?.refundedAmount ?? 0,
      currency: selected?.currency ?? requestedCurrency ?? "INR",
      currencies: rows.map((row) => row.currency),
    };
  }

  function pruneStatsCache(now: number) {
    if (statsCache.size <= STATS_CACHE_MAX_ENTRIES) return;
    for (const [key, entry] of statsCache) {
      if (entry.expiresAt <= now) statsCache.delete(key);
    }
    // Still over the cap: drop oldest-inserted first.
    for (const key of statsCache.keys()) {
      if (statsCache.size <= STATS_CACHE_MAX_ENTRIES) break;
      statsCache.delete(key);
    }
  }

  async function getRawStatsForCourses(
    scope: OrderScope,
    filters: {
      courseId?: string | string[];
      from?: Date;
      to?: Date;
      currency?: string;
    },
  ): Promise<orderRepo.OrderStatsRow> {
    const rows = await orderRepo.getOrderStatsByCurrency(database, scope, {
      courseId: filters.courseId,
      from: filters.from,
      to: filters.to,
    });
    const requestedCurrency = filters.currency?.toUpperCase();
    const selected = requestedCurrency
      ? rows.find((row) => row.currency === requestedCurrency)
      : [...rows].sort(
          (a, b) =>
            b.totalOrders - a.totalOrders || a.currency.localeCompare(b.currency),
        )[0];
    return (
      selected ?? {
        currency: requestedCurrency ?? "INR",
        totalOrders: 0,
        uniqueBuyers: 0,
        grossPaid: 0,
        refundedAmount: 0,
      }
    );
  }

  async function getOrderStatusFunnel(
    scope: OrderScope,
    filters: { from?: Date; to?: Date; courseId?: string | string[] },
  ) {
    return await orderRepo.getOrderStatusFunnel(database, scope, filters);
  }

  async function getRevenueTrend(
    scope: OrderScope,
    filters: orderRepo.RevenueTrendFilters,
  ): Promise<orderRepo.RevenueTrendPoint[]> {
    return await orderRepo.getRevenueTrend(database, scope, filters);
  }

  async function getAcademyScope(): Promise<OrderScope> {
    const academy = await setupRepo.findAcademy(database);
    if (!academy) {
      throw new AppError(500, "ACADEMY_NOT_FOUND", "Academy is not configured.");
    }
    return { type: "academy", id: academy.id };
  }

  return {
    getOrderById,
    listOrders,
    getOrderStats,
    getRawStatsForCourses,
    getOrderStatusFunnel,
    getRevenueTrend,
    getAcademyScope,
  };
}
