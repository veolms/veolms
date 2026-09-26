import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { Order, OrdersListResponse, Invoice } from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { orderKeys } from "./orders.keys";
import { ordersService } from "./orders.service";

/**
 * Infinite-scrolling query for the student's orders.
 * Uses cursor-based pagination — each page returns a `nextCursor`
 * that feeds into the next `getNextPageParam` call.
 */
export function useOrders(options?: { enabled?: boolean; limit?: number }) {
  const limit = options?.limit ?? 20;

  return useInfiniteQuery<OrdersListResponse, ApiError>({
    queryKey: orderKeys.lists(),
    queryFn: ({ pageParam }) =>
      ordersService.listOrders({
        cursor: pageParam as string | undefined,
        limit,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: options?.enabled ?? true,
    staleTime: 30 * 1000,
  });
}

export function useOrder(orderId: string | null) {
  return useQuery<Order, ApiError>({
    queryKey: orderId ? orderKeys.detail(orderId) : ["orders", "detail", null],
    queryFn: () => ordersService.getOrder(orderId!),
    enabled: Boolean(orderId),
    staleTime: 60 * 1000,
  });
}

export function useOrderInvoice(orderId: string | null) {
  return useQuery<Invoice, ApiError>({
    queryKey: orderId ? orderKeys.invoice(orderId) : ["orders", "invoice", null],
    queryFn: () => ordersService.getInvoice(orderId!),
    enabled: Boolean(orderId),
    staleTime: 5 * 60 * 1000,
  });
}
