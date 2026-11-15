import { useCallback } from "react";
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  AdminOrdersListResponse,
  LearnerOrdersListResponse,
  OrderResponse,
  OrderStatsQueryInput,
  OrderStatsResponse,
  OrderCourseOptionsResponse,
  Invoice,
  OrderView,
  NeedsRefundListResponse,
} from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { orderKeys } from "./orders.keys";
import { ordersService, type OrdersListParams } from "./orders.service";

const DEFAULT_ORDERS_PAGE_SIZE = 30;

/**
 * One numbered page of the academy's orders (admin view), with how many
 * match in all. The previous page stays on screen while the next loads.
 */
export function useAdminOrdersPage(
  params: OrdersListParams & { page: number },
  options?: { enabled?: boolean },
) {
  return useQuery<AdminOrdersListResponse, ApiError>({
    queryKey: orderKeys.list({ ...params, view: "admin" }),
    queryFn: () => ordersService.listAdminOrders(params),
    enabled: options?.enabled ?? true,
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });
}

/** The courses the Orders screen filters by. */
export function useOrderCourseOptions(options?: { enabled?: boolean }) {
  return useQuery<OrderCourseOptionsResponse, ApiError>({
    queryKey: orderKeys.courseOptions(),
    queryFn: () => ordersService.listOrderCourseOptions(),
    enabled: options?.enabled ?? true,
    staleTime: 5 * 60 * 1000,
  });
}

/** Infinite-scrolling query for the signed-in user's own purchases. */
export function useMyOrders(
  params?: OrdersListParams,
  options?: { enabled?: boolean },
) {
  const queryParams = {
    ...params,
    limit: params?.limit ?? DEFAULT_ORDERS_PAGE_SIZE,
  };

  return useInfiniteQuery<LearnerOrdersListResponse, ApiError>({
    queryKey: orderKeys.list({ ...queryParams, view: "student" }),
    queryFn: ({ pageParam }) =>
      ordersService.listMyOrders({
        ...queryParams,
        cursor: pageParam as string | undefined,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: options?.enabled ?? true,
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });
}

/**
 * Aggregated statistics query for orders (Net Revenue, Total Orders, etc.).
 */
export function useOrderStats(
  params?: OrderStatsQueryInput,
  options?: { enabled?: boolean },
) {
  return useQuery<OrderStatsResponse, ApiError>({
    queryKey: orderKeys.stats(params),
    queryFn: () => ordersService.getOrderStats(params),
    enabled: options?.enabled ?? true,
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });
}

/** How many "needs a manual refund" entries the Orders screen asks for. */
const NEEDS_REFUND_PAGE_SIZE = 20;

/**
 * Payments staff have to refund by hand (the newest few). One small
 * request; it sits under `orderKeys.all`, so refunding an order from this
 * screen refreshes it along with the lists.
 */
export function useOrdersNeedingRefund(options?: { enabled?: boolean }) {
  return useQuery<NeedsRefundListResponse, ApiError>({
    queryKey: orderKeys.needsRefund(),
    queryFn: () =>
      ordersService.listNeedsRefund({ limit: NEEDS_REFUND_PAGE_SIZE }),
    enabled: options?.enabled ?? true,
    staleTime: 30 * 1000,
  });
}

export function useOrder(orderId: string | null, view?: OrderView) {
  return useQuery<OrderResponse, ApiError>({
    queryKey: orderId
      ? orderKeys.detail(orderId, view)
      : ["orders", "detail", null],
    queryFn: () => ordersService.getOrder(orderId!, view),
    enabled: Boolean(orderId),
    staleTime: 60 * 1000,
  });
}

/**
 * Loads one order into the cache `useOrder` reads from and resolves with
 * it, or rejects if it cannot be read. For opening an order on a click,
 * where a failure has to be reported at once.
 */
export function useFetchOrder() {
  const queryClient = useQueryClient();
  return useCallback(
    (orderId: string, view?: OrderView) =>
      queryClient.fetchQuery<OrderResponse, ApiError>({
        queryKey: orderKeys.detail(orderId, view),
        queryFn: () => ordersService.getOrder(orderId, view),
        staleTime: 60 * 1000,
      }),
    [queryClient],
  );
}

export function useOrderInvoice(orderId: string | null, view?: OrderView) {
  return useQuery<Invoice, ApiError>({
    queryKey: orderId
      ? orderKeys.invoice(orderId, view)
      : ["orders", "invoice", null],
    queryFn: () => ordersService.getInvoice(orderId!, view),
    enabled: Boolean(orderId),
    staleTime: 5 * 60 * 1000,
  });
}
