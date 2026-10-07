import type {
  OrderResponse,
  OrdersListResponse,
  OrdersListQuery,
  OrderScope,
  OrderStatsQuery,
  OrderStatsResponse,
} from "@veolms/contracts";
import { decodeOrderCursor, encodeOrderCursor } from "@veolms/contracts";
import type { Executor } from "../shared/repository.types.ts";
import { CommerceErrors } from "../shared/commerce.errors.ts";
import { AppError } from "../../../lib/errors.ts";
import {
  createStudentsService,
  type StudentsService,
} from "../../students/index.ts";
import * as orderRepo from "./order.repository.ts";
import { toAdminOrder, toLearnerOrder } from "./order.mapper.ts";

export interface OrderService {
  getOrderById(scope: OrderScope, orderId: string): Promise<OrderResponse>;
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
      toExclusive?: Date;
      currency?: string;
    },
  ): Promise<orderRepo.OrderStatsRow>;
  getOrderStatusFunnel(
    scope: OrderScope,
    filters: {
      from?: Date;
      to?: Date;
      toExclusive?: Date;
      courseId?: string | string[];
    },
  ): Promise<{ created: number; paid: number; refunded: number }>;
  /** The scope admin-view requests run under (single academy per deployment). */
  getAcademyScope(): Promise<OrderScope>;
}

const STATS_CACHE_TTL_MS = 30_000;
const STATS_CACHE_MAX_ENTRIES = 200;

export function createOrderService({
  database,
  studentsService = createStudentsService({ database }),
}: {
  database: Executor;
  studentsService?: Pick<StudentsService, "resolveStudentAvatars">;
}): OrderService {
  const statsCache = new Map<
    string,
    { expiresAt: number; value: Promise<OrderStatsResponse> }
  >();

  async function getOrderById(
    scope: OrderScope,
    orderId: string,
  ): Promise<OrderResponse> {
    const order = await orderRepo.findOrderById(database, orderId, scope);
    if (!order) {
      throw CommerceErrors.ORDER_NOT_FOUND(orderId);
    }

    // Defensive assertion in service layer
    if (scope.type === "user" && order.user_id !== scope.id) {
      throw CommerceErrors.ORDER_NOT_FOUND(orderId);
    }

    const [items, payments, users, coupons] = await Promise.all([
      orderRepo.listOrderItemSummariesByOrderIds(database, [order.id]),
      orderRepo.listPaymentsForOrders(database, [order.id]),
      scope.type === "academy"
        ? orderRepo.listUsersByIds(database, [order.user_id])
        : Promise.resolve([]),
      scope.type === "academy" && order.coupon_id
        ? orderRepo.listCouponCodesByIds(database, [order.coupon_id])
        : Promise.resolve([]),
    ]);

    if (scope.type === "user") {
      return toLearnerOrder(order, items, payments[0]);
    }

    const avatarUrls = await resolveAvatarUrls(users);
    return toAdminOrder(order, items, {
      user: users[0],
      avatarUrl: avatarUrls.get(order.user_id) ?? null,
      couponCode: coupons[0]?.code,
      payment: payments[0],
    });
  }

  /** Same avatar the student screens show, resolved for a page of buyers. */
  async function resolveAvatarUrls(
    users: Awaited<ReturnType<typeof orderRepo.listUsersByIds>>,
  ) {
    return await studentsService.resolveStudentAvatars(
      users.map((user) => ({
        id: user.id,
        avatarDataUrl: user.avatar_data_url,
      })),
    );
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
          err instanceof Error
            ? err.message
            : "The pagination cursor is invalid.",
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
        pageRows
          .map((o) => o.coupon_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    // Batch load relations in parallel
    const [allItems, payments, users, coupons] = await Promise.all([
      orderRepo.listOrderItemSummariesByOrderIds(database, orderIds),
      orderRepo.listPaymentsForOrders(database, orderIds),
      scope.type === "academy"
        ? orderRepo.listUsersByIds(database, userIds)
        : Promise.resolve([]),
      scope.type === "academy" && couponIds.length > 0
        ? orderRepo.listCouponCodesByIds(database, couponIds)
        : Promise.resolve([]),
    ]);

    // Index batch loaded relations
    const itemsByOrderId = new Map<string, typeof allItems>();
    for (const item of allItems) {
      const list = itemsByOrderId.get(item.order_id) ?? [];
      list.push(item);
      itemsByOrderId.set(item.order_id, list);
    }

    // One row per order (see listPaymentsForOrders).
    const paymentsByOrderId = new Map(payments.map((p) => [p.order_id, p]));

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

    if (scope.type === "user") {
      return {
        orders: pageRows.map((order) =>
          toLearnerOrder(
            order,
            itemsByOrderId.get(order.id) ?? [],
            paymentsByOrderId.get(order.id),
          ),
        ),
        nextCursor,
      };
    }

    const usersById = new Map(users.map((u) => [u.id, u]));
    const couponCodesById = new Map(coupons.map((c) => [c.id, c.code]));
    const avatarUrls = await resolveAvatarUrls(users);

    return {
      orders: pageRows.map((order) =>
        toAdminOrder(order, itemsByOrderId.get(order.id) ?? [], {
          user: usersById.get(order.user_id),
          avatarUrl: avatarUrls.get(order.user_id) ?? null,
          couponCode: order.coupon_id
            ? couponCodesById.get(order.coupon_id)
            : undefined,
          payment: paymentsByOrderId.get(order.id),
        }),
      ),
      nextCursor,
    };
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
            b.totalOrders - a.totalOrders ||
            a.currency.localeCompare(b.currency),
        )[0];

    return {
      // Successful orders only: gross paid − partial refunds on those orders.
      netRevenue: selected
        ? selected.grossPaid - selected.refundedAgainstPaid
        : 0,
      totalEarnings: selected?.totalEarnings ?? 0,
      totalOrders: selected?.totalOrders ?? 0,
      uniqueBuyers: selected?.uniqueBuyers ?? 0,
      refundedAmount: selected?.refundedAmount ?? 0,
      currency: selected?.currency ?? requestedCurrency ?? "INR",
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
      toExclusive?: Date;
      currency?: string;
    },
  ): Promise<orderRepo.OrderStatsRow> {
    const rows = await orderRepo.getOrderStatsByCurrency(database, scope, {
      courseId: filters.courseId,
      from: filters.from,
      to: filters.to,
      toExclusive: filters.toExclusive,
    });
    const requestedCurrency = filters.currency?.toUpperCase();
    const selected = requestedCurrency
      ? rows.find((row) => row.currency === requestedCurrency)
      : [...rows].sort(
          (a, b) =>
            b.totalOrders - a.totalOrders ||
            a.currency.localeCompare(b.currency),
        )[0];
    return (
      selected ?? {
        currency: requestedCurrency ?? "INR",
        totalOrders: 0,
        uniqueBuyers: 0,
        grossPaid: 0,
        totalEarnings: 0,
        refundedAmount: 0,
        refundedAgainstPaid: 0,
      }
    );
  }

  async function getOrderStatusFunnel(
    scope: OrderScope,
    filters: {
      from?: Date;
      to?: Date;
      toExclusive?: Date;
      courseId?: string | string[];
    },
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
    const academyId = await orderRepo.findAcademyId(database);
    if (!academyId) {
      throw new AppError(
        500,
        "ACADEMY_NOT_FOUND",
        "Academy is not configured.",
      );
    }
    return { type: "academy", id: academyId };
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
