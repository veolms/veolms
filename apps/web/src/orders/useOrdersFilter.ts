import { useMemo, useState } from "react";
import type {
  OrderItem,
  OrderSummaryMetrics,
  OrderTabId,
  RecentPaymentItem,
} from "./ordersData";
import { useOrders } from "../services/orders";
import {
  adaptOrderToOrderItem,
  computeOrderSummary,
  extractRecentPayments,
} from "./orderAdapter";

export interface UseOrdersFilterReturn {
  orders: readonly OrderItem[];
  orderSummary: OrderSummaryMetrics;
  recentPayments: readonly RecentPaymentItem[];
  totalFilteredCount: number;
  totalLoadedCount: number;
  activeTab: OrderTabId;
  setActiveTab: (tab: OrderTabId) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  courseFilter: string;
  setCourseFilter: (course: string) => void;
  statusFilter: string;
  setStatusFilter: (status: string) => void;
  selectedReceiptOrder: OrderItem | null;
  setSelectedReceiptOrder: (order: OrderItem | null) => void;
  resetFilters: () => void;
  isLoading: boolean;
  isError: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  refetch: () => void;
}

export function useOrdersFilter(
  setNotice?: (message: string) => void,
): UseOrdersFilterReturn {
  const {
    data,
    isLoading,
    isError,
    hasNextPage = false,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
  } = useOrders();

  const [activeTab, setActiveTab] = useState<OrderTabId>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [courseFilter, setCourseFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedReceiptOrder, setSelectedReceiptOrder] =
    useState<OrderItem | null>(null);

  const rawOrders = useMemo(() => {
    return data?.pages.flatMap((page) => page.orders) || [];
  }, [data?.pages]);

  const ordersList = useMemo(() => {
    return rawOrders.map(adaptOrderToOrderItem);
  }, [rawOrders]);

  const orderSummary = useMemo(() => {
    return computeOrderSummary(ordersList);
  }, [ordersList]);

  const recentPayments = useMemo(() => {
    return extractRecentPayments(ordersList);
  }, [ordersList]);

  const resetFilters = () => {
    setActiveTab("all");
    setSearchQuery("");
    setCourseFilter("all");
    setStatusFilter("all");
  };

  const filteredOrders = useMemo(() => {
    let result = [...ordersList];

    // Filter by Tab
    if (activeTab !== "all") {
      result = result.filter((item) => item.status === activeTab);
    }

    // Filter by Course Select
    if (courseFilter !== "all") {
      result = result.filter(
        (item) =>
          item.courseId === courseFilter || item.courseTitle === courseFilter,
      );
    }

    // Filter by Status Select
    if (statusFilter !== "all") {
      result = result.filter((item) => item.status === statusFilter);
    }

    // Filter by Search Query (course name or order ID like #PC-72401)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(
        (item) =>
          item.courseTitle.toLowerCase().includes(query) ||
          item.orderNumber.toLowerCase().includes(query) ||
          item.paymentMethod.toLowerCase().includes(query),
      );
    }

    return result;
  }, [ordersList, activeTab, courseFilter, statusFilter, searchQuery]);

  return {
    orders: filteredOrders,
    orderSummary,
    recentPayments,
    totalFilteredCount: filteredOrders.length,
    totalLoadedCount: ordersList.length,
    activeTab,
    setActiveTab,
    searchQuery,
    setSearchQuery,
    courseFilter,
    setCourseFilter,
    statusFilter,
    setStatusFilter,
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
