import { useCallback, useMemo, useState } from "react";
import type { OrderSortOrder } from "@veolms/contracts";
import {
  DEFAULT_DEBOUNCE_DELAY_MS,
  useDebounceValue,
} from "../hooks/useDebounce";
import type { OrderHistoryItem } from "./orderHistoryData";
import { useOrders } from "../services/orders";
import { adaptOrderToOrderHistoryItem } from "../orders/orderAdapter";

export interface UseOrderHistoryFilterReturn {
  orders: readonly OrderHistoryItem[];
  paginatedOrders: readonly OrderHistoryItem[];
  totalFilteredCount: number;
  totalLoadedCount: number;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  dateRangeFilter: string;
  setDateRangeFilter: (range: string) => void;
  statusFilter: string;
  setStatusFilter: (status: string) => void;
  paymentMethodFilter: string;
  setPaymentMethodFilter: (method: string) => void;
  currentPage: number;
  setCurrentPage: (page: number) => void;
  pageSize: number;
  totalPages: number;
  sortOrder: OrderSortOrder;
  toggleSortOrder: () => void;
  selectedReceiptOrder: OrderHistoryItem | null;
  setSelectedReceiptOrder: (order: OrderHistoryItem | null) => void;
  resetFilters: () => void;
  isLoading: boolean;
  isError: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  refetch: () => void;
}

function getDateBounds(range: string): { from?: Date; to?: Date } {
  const now = new Date();
  if (range === "all") return {};

  if (range === "2024" || range === "2025") {
    return {
      from: new Date(Number(range), 0, 1),
      to: new Date(Number(range), 11, 31, 23, 59, 59, 999),
    };
  }

  const from = new Date(now);
  if (range === "30d") from.setDate(from.getDate() - 30);
  else if (range === "3m") from.setMonth(from.getMonth() - 3);
  else if (range === "6m") from.setMonth(from.getMonth() - 6);
  else return {};

  return { from, to: now };
}

export function useOrderHistoryFilter(
  _setNotice?: (message: string) => void,
): UseOrderHistoryFilterReturn {
  const [searchQuery, setSearchQueryState] = useState("");
  const [debouncedSearch] = useDebounceValue(
    searchQuery.trim(),
    DEFAULT_DEBOUNCE_DELAY_MS,
  );
  const [dateRangeFilter, setDateRangeFilterState] = useState("all");
  const [statusFilter, setStatusFilterState] = useState("all");
  const [paymentMethodFilter, setPaymentMethodFilterState] = useState("all");
  const [currentPage, setCurrentPageState] = useState(1);
  const [sortOrder, setSortOrder] = useState<OrderSortOrder>("desc");
  const [selectedReceiptOrder, setSelectedReceiptOrder] =
    useState<OrderHistoryItem | null>(null);
  const pageSize = 10;

  const dateBounds = useMemo(
    () => getDateBounds(dateRangeFilter),
    [dateRangeFilter],
  );
  const queryParams = useMemo(
    () => ({
      view: "student" as const,
      limit: 30,
      sortOrder,
      ...dateBounds,
    }),
    [dateBounds, sortOrder],
  );
  const {
    data,
    isLoading,
    isError,
    hasNextPage = false,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
  } = useOrders(queryParams);

  const ordersList = useMemo(
    () => (data?.pages.flatMap((page) => page.orders) ?? []).map(adaptOrderToOrderHistoryItem),
    [data?.pages],
  );

  const filteredOrders = useMemo(() => {
    const search = debouncedSearch.toLocaleLowerCase();
    return ordersList.filter((order) => {
      if (statusFilter !== "all" && order.status !== statusFilter) return false;
      if (paymentMethodFilter !== "all" && order.payment.type !== paymentMethodFilter) {
        return false;
      }
      if (!search) return true;
      return [
        order.orderNumber,
        order.invoiceNumber,
        order.courseTitle,
        order.payment.brand,
        order.payment.label,
      ].some((value) => value.toLocaleLowerCase().includes(search));
    });
  }, [debouncedSearch, ordersList, paymentMethodFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedOrders = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredOrders.slice(start, start + pageSize);
  }, [filteredOrders, pageSize, safeCurrentPage]);

  const setSearchQuery = useCallback((query: string) => {
    setSearchQueryState(query);
    setCurrentPageState(1);
  }, []);
  const setDateRangeFilter = useCallback((range: string) => {
    setDateRangeFilterState(range);
    setCurrentPageState(1);
  }, []);
  const setStatusFilter = useCallback((status: string) => {
    setStatusFilterState(status);
    setCurrentPageState(1);
  }, []);
  const setPaymentMethodFilter = useCallback((method: string) => {
    setPaymentMethodFilterState(method);
    setCurrentPageState(1);
  }, []);
  const setCurrentPage = useCallback((page: number) => {
    setCurrentPageState(Math.max(1, page));
  }, []);
  const toggleSortOrder = useCallback(() => {
    setSortOrder((current) => (current === "desc" ? "asc" : "desc"));
    setCurrentPageState(1);
  }, []);
  const resetFilters = useCallback(() => {
    setSearchQueryState("");
    setDateRangeFilterState("all");
    setStatusFilterState("all");
    setPaymentMethodFilterState("all");
    setCurrentPageState(1);
    setSortOrder("desc");
  }, []);

  return {
    orders: filteredOrders,
    paginatedOrders,
    totalFilteredCount: filteredOrders.length,
    totalLoadedCount: ordersList.length,
    searchQuery,
    setSearchQuery,
    dateRangeFilter,
    setDateRangeFilter,
    statusFilter,
    setStatusFilter,
    paymentMethodFilter,
    setPaymentMethodFilter,
    currentPage: safeCurrentPage,
    setCurrentPage,
    pageSize,
    totalPages,
    sortOrder,
    toggleSortOrder,
    selectedReceiptOrder,
    setSelectedReceiptOrder,
    resetFilters,
    isLoading,
    isError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
  };
}
