import { useMemo, useState } from "react";
import {
  initialOrdersList,
  initialOrderSummary,
  initialRecentPayments,
  type OrderItem,
  type OrderStatus,
  type OrderSummaryMetrics,
  type OrderTabId,
  type RecentPaymentItem,
} from "./ordersData";

export interface UseOrdersFilterReturn {
  orders: readonly OrderItem[];
  orderSummary: OrderSummaryMetrics;
  recentPayments: readonly RecentPaymentItem[];
  totalFilteredCount: number;
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
}

export function useOrdersFilter(
  setNotice?: (message: string) => void,
): UseOrdersFilterReturn {
  const [ordersList] = useState<readonly OrderItem[]>(initialOrdersList);
  const [activeTab, setActiveTab] = useState<OrderTabId>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [courseFilter, setCourseFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedReceiptOrder, setSelectedReceiptOrder] =
    useState<OrderItem | null>(null);

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
    orderSummary: initialOrderSummary,
    recentPayments: initialRecentPayments,
    totalFilteredCount: filteredOrders.length,
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
  };
}
