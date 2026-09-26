import { useCallback, useMemo, useState } from "react";
import type {
  Order,
  OrderStatus,
  OrderStatsResponse,
  OrderSortOrder,
} from "@veolms/contracts";
import {
  DEFAULT_DEBOUNCE_DELAY_MS,
  useDebounceValue,
} from "../hooks/useDebounce";
import { useOrders, useOrderStats } from "../services/orders";

export type DateRangePreset =
  | "all_time"
  | "today"
  | "last_7_days"
  | "last_30_days"
  | "this_month"
  | "last_month"
  | "custom";

export interface DateRangeState {
  preset: DateRangePreset;
  label: string;
  from?: Date;
  to?: Date;
}

function resolveDateRange(preset: DateRangePreset, customFrom?: Date, customTo?: Date): {
  from?: Date;
  to?: Date;
  label: string;
} {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (preset) {
    case "today": {
      const endOfToday = new Date(today);
      endOfToday.setHours(23, 59, 59, 999);
      return { from: today, to: endOfToday, label: "Today" };
    }
    case "last_7_days": {
      const from = new Date(today);
      from.setDate(today.getDate() - 7);
      return { from, to: now, label: "Last 7 days" };
    }
    case "last_30_days": {
      const from = new Date(today);
      from.setDate(today.getDate() - 30);
      const startStr = from.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const endStr = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      return { from, to: now, label: `${startStr} – ${endStr}` };
    }
    case "this_month": {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from, to: now, label: "This Month" };
    }
    case "last_month": {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { from, to, label: "Last Month" };
    }
    case "custom": {
      if (customFrom && customTo) {
        const startStr = customFrom.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        const endStr = customTo.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        return { from: customFrom, to: customTo, label: `${startStr} – ${endStr}` };
      }
      return { label: "Custom Range" };
    }
    case "all_time":
    default:
      return { label: "All Time" };
  }
}

export interface UseOrdersFilterReturn {
  // Query data
  orders: readonly Order[];
  stats: OrderStatsResponse | undefined;
  isLoadingStats: boolean;
  isLoading: boolean;
  isError: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  refetch: () => void;

  // Search
  searchQuery: string;
  setSearchQuery: (query: string) => void;

  // Filters
  courseFilter: string | undefined;
  setCourseFilter: (courseId: string | undefined) => void;
  couponFilter: string | undefined;
  setCouponFilter: (couponId: string | undefined) => void;
  statusFilter: OrderStatus | undefined;
  setStatusFilter: (status: OrderStatus | undefined) => void;

  // Date range
  datePreset: DateRangePreset;
  dateLabel: string;
  setDatePreset: (preset: DateRangePreset, from?: Date, to?: Date) => void;

  // Sort
  sortOrder: OrderSortOrder;
  toggleSortOrder: () => void;

  // Detail Drawer
  selectedOrderId: string | null;
  selectedOrder: Order | null;
  setSelectedOrderId: (id: string | null) => void;
  hasPrevOrder: boolean;
  hasNextOrder: boolean;
  selectPrevOrder: () => void;
  selectNextOrder: () => void;

  // Actions / Modals
  refundTargetOrder: Order | null;
  setRefundTargetOrder: (order: Order | null) => void;
  // Reset
  isFiltered: boolean;
  resetFilters: () => void;
}

export function useOrdersFilter(options?: {
  enabled?: boolean;
}): UseOrdersFilterReturn {
  const enabled = options?.enabled ?? true;

  // Search with debounce (150ms for responsive server-side sync)
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearchImmediately] = useDebounceValue(
    searchQuery.trim(),
    150,
  );

  // Filters
  const [courseFilter, setCourseFilter] = useState<string | undefined>(undefined);
  const [couponFilter, setCouponFilter] = useState<string | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | undefined>(undefined);
  const [sortOrder, setSortOrder] = useState<OrderSortOrder>("desc");

  // Date Range (default: last_30_days matching the mockup e.g. "May 6 - Jun 4, 2025")
  const [datePreset, setDatePresetState] = useState<DateRangePreset>("last_30_days");
  const [customFrom, setCustomFrom] = useState<Date | undefined>(undefined);
  const [customTo, setCustomTo] = useState<Date | undefined>(undefined);

  const { from: filterFrom, to: filterTo, label: dateLabel } = useMemo(
    () => resolveDateRange(datePreset, customFrom, customTo),
    [datePreset, customFrom, customTo],
  );

  const setDatePreset = useCallback((preset: DateRangePreset, from?: Date, to?: Date) => {
    setDatePresetState(preset);
    if (preset === "custom") {
      setCustomFrom(from);
      setCustomTo(to);
    } else {
      setCustomFrom(undefined);
      setCustomTo(undefined);
    }
  }, []);

  const toggleSortOrder = useCallback(() => {
    setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"));
  }, []);

  // API query params
  const queryParams = useMemo(() => {
    return {
      view: "admin" as const,
      search: debouncedSearch || undefined,
      courseId: courseFilter,
      couponId: couponFilter,
      status: statusFilter,
      from: filterFrom,
      to: filterTo,
      sortOrder,
      limit: 30,
    };
  }, [debouncedSearch, courseFilter, couponFilter, statusFilter, filterFrom, filterTo, sortOrder]);

  const {
    data,
    isLoading,
    isError,
    hasNextPage = false,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
  } = useOrders(queryParams, { enabled });

  // Stats query
  const statsParams = useMemo(() => {
    return {
      courseId: courseFilter,
      couponId: couponFilter,
      status: statusFilter,
      from: filterFrom,
      to: filterTo,
    };
  }, [courseFilter, couponFilter, statusFilter, filterFrom, filterTo]);

  const { data: stats, isLoading: isLoadingStats } = useOrderStats(statsParams, { enabled });

  // Server-loaded orders
  const serverOrders = useMemo(() => {
    return data?.pages.flatMap((page) => page.orders) || [];
  }, [data?.pages]);

  // Instant in-memory search filter (0ms response time on user input)
  const orders = useMemo(() => {
    if (!searchQuery.trim()) return serverOrders;
    const term = searchQuery.trim().toLowerCase();
    return serverOrders.filter((order) => {
      const orderNum = (order.orderNumber || "").toLowerCase();
      const studentName = (
        order.admin?.student?.name ||
        order.admin?.student?.displayName ||
        ""
      ).toLowerCase();
      const studentUser = (order.admin?.student?.username || "").toLowerCase();
      const studentEmail = (order.admin?.student?.email || "").toLowerCase();
      const courseTitle = (order.items?.[0]?.titleSnapshot || "").toLowerCase();
      const couponCode = (order.admin?.coupon?.code || "").toLowerCase();
      return (
        orderNum.includes(term) ||
        studentName.includes(term) ||
        studentUser.includes(term) ||
        studentEmail.includes(term) ||
        courseTitle.includes(term) ||
        couponCode.includes(term)
      );
    });
  }, [serverOrders, searchQuery]);

  // Drawer Inspection
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const selectedOrderIndex = useMemo(() => {
    if (!selectedOrderId) return -1;
    return orders.findIndex((o) => o.id === selectedOrderId);
  }, [orders, selectedOrderId]);

  const selectedOrder = useMemo(() => {
    if (!selectedOrderId) return null;
    return orders.find((o) => o.id === selectedOrderId) ?? null;
  }, [orders, selectedOrderId]);

  const hasPrevOrder = selectedOrderIndex > 0;
  const hasNextOrder = selectedOrderIndex !== -1 && selectedOrderIndex < orders.length - 1;

  const selectPrevOrder = useCallback(() => {
    if (hasPrevOrder) {
      setSelectedOrderId(orders[selectedOrderIndex - 1]!.id);
    }
  }, [hasPrevOrder, orders, selectedOrderIndex]);

  const selectNextOrder = useCallback(() => {
    if (hasNextOrder) {
      setSelectedOrderId(orders[selectedOrderIndex + 1]!.id);
    }
  }, [hasNextOrder, orders, selectedOrderIndex]);

  // Modal targets
  const [refundTargetOrder, setRefundTargetOrder] = useState<Order | null>(null);
  const isFiltered = Boolean(
    searchQuery ||
    courseFilter ||
    couponFilter ||
    statusFilter ||
    datePreset !== "last_30_days"
  );

  const resetFilters = useCallback(() => {
    setSearchQuery("");
    setDebouncedSearchImmediately("");
    setCourseFilter(undefined);
    setCouponFilter(undefined);
    setStatusFilter(undefined);
    setDatePresetState("last_30_days");
    setCustomFrom(undefined);
    setCustomTo(undefined);
    setSortOrder("desc");
  }, [setDebouncedSearchImmediately]);

  return {
    orders,
    stats,
    isLoadingStats,
    isLoading,
    isError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
    searchQuery,
    setSearchQuery,
    courseFilter,
    setCourseFilter,
    couponFilter,
    setCouponFilter,
    statusFilter,
    setStatusFilter,
    datePreset,
    dateLabel,
    setDatePreset,
    sortOrder,
    toggleSortOrder,
    selectedOrderId,
    selectedOrder,
    setSelectedOrderId,
    hasPrevOrder,
    hasNextOrder,
    selectPrevOrder,
    selectNextOrder,
    refundTargetOrder,
    setRefundTargetOrder,
    isFiltered,
    resetFilters,
  };
}
