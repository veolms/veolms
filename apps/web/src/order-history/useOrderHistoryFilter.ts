import { useMemo, useState } from "react";
import type { Order, OrderSortOrder } from "@veolms/contracts";
import { DEFAULT_DEBOUNCE_DELAY_MS, useDebounceValue } from "../hooks/useDebounce";
import { useOrders } from "../services/orders";

export interface UseOrderHistoryFilterReturn {
  orders: readonly Order[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  sortOrder: OrderSortOrder;
  toggleSortOrder: () => void;
  isLoading: boolean;
  isError: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => Promise<unknown>;
  refetch: () => Promise<unknown>;
}

export function useOrderHistoryFilter(): UseOrderHistoryFilterReturn {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch] = useDebounceValue(
    searchQuery.trim(),
    DEFAULT_DEBOUNCE_DELAY_MS,
  );
  const [sortOrder, setSortOrder] = useState<OrderSortOrder>("desc");

  const params = useMemo(
    () => ({
      view: "student" as const,
      search: debouncedSearch || undefined,
      sortOrder,
      limit: 30,
    }),
    [debouncedSearch, sortOrder],
  );
  const query = useOrders(params);

  const orders = useMemo(
    () => query.data?.pages.flatMap((page) => page.orders) ?? [],
    [query.data?.pages],
  );

  return {
    orders,
    searchQuery,
    setSearchQuery,
    sortOrder,
    toggleSortOrder: () =>
      setSortOrder((current) => (current === "desc" ? "asc" : "desc")),
    isLoading: query.isLoading,
    isError: query.isError,
    hasNextPage: query.hasNextPage ?? false,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
    refetch: query.refetch,
  };
}
