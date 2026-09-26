import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type {
  Order,
  OrdersListResponse,
  OrdersListQueryInput,
  OrderStatsQuery,
  OrderStatsResponse,
  Invoice,
  OrderView,
} from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { orderKeys } from "./orders.keys";
import { ordersService } from "./orders.service";

/**
 * Infinite-scrolling query for orders (admin or student view).
 * Uses cursor-based keyset pagination — each page returns a `nextCursor`
 * that feeds into the next `getNextPageParam` call.
 */
export function useOrders(
  params?: OrdersListQueryInput,
  options?: { enabled?: boolean },
) {
  const limit = params?.limit ?? 30;
  const queryParams = { ...params, limit };

  return useInfiniteQuery<OrdersListResponse, ApiError>({
    queryKey: orderKeys.list(queryParams),
    queryFn: ({ pageParam }) =>
      ordersService.listOrders({
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
  params?: OrderStatsQuery,
  options?: { enabled?: boolean },
) {
  return useQuery<OrderStatsResponse, ApiError>({
    queryKey: orderKeys.stats(params),
    queryFn: () => ordersService.getOrderStats(params),
    enabled: options?.enabled ?? true,
    staleTime: 30 * 1000,
  });
}

export function useOrder(orderId: string | null, view?: OrderView) {
  return useQuery<Order, ApiError>({
    queryKey: orderId
      ? orderKeys.detail(orderId, view)
      : ["orders", "detail", null],
    queryFn: () => ordersService.getOrder(orderId!, view),
    enabled: Boolean(orderId),
    staleTime: 60 * 1000,
  });
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
