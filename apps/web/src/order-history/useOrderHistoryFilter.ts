import { useMemo, useState } from "react";
import {
  initialOrderHistoryList,
  type OrderHistoryItem,
  type OrderHistoryStatus,
  type OrderHistoryTabId,
} from "./orderHistoryData";

export interface UseOrderHistoryFilterReturn {
  orders: readonly OrderHistoryItem[];
  paginatedOrders: readonly OrderHistoryItem[];
  totalFilteredCount: number;
  activeTab: OrderHistoryTabId;
  setActiveTab: (tab: OrderHistoryTabId) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  dateRangeFilter: string;
  setDateRangeFilter: (dateRange: string) => void;
  statusFilter: string;
  setStatusFilter: (status: string) => void;
  paymentMethodFilter: string;
  setPaymentMethodFilter: (method: string) => void;
  currentPage: number;
  setCurrentPage: (page: number) => void;
  pageSize: number;
  totalPages: number;
  tabCounts: Record<OrderHistoryTabId, number>;
  selectedReceiptOrder: OrderHistoryItem | null;
  setSelectedReceiptOrder: (order: OrderHistoryItem | null) => void;
  resetFilters: () => void;
}

export function useOrderHistoryFilter(
  setNotice?: (message: string) => void,
): UseOrderHistoryFilterReturn {
  const [ordersList] = useState<readonly OrderHistoryItem[]>(
    initialOrderHistoryList,
  );
  const [activeTab, setActiveTab] = useState<OrderHistoryTabId>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRangeFilter, setDateRangeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedReceiptOrder, setSelectedReceiptOrder] =
    useState<OrderHistoryItem | null>(null);

  const pageSize = 6;

  const resetFilters = () => {
    setActiveTab("all");
    setSearchQuery("");
    setDateRangeFilter("all");
    setStatusFilter("all");
    setPaymentMethodFilter("all");
    setCurrentPage(1);
  };

  // Compute live tab counts
  const tabCounts = useMemo(() => {
    const counts: Record<OrderHistoryTabId, number> = {
      all: ordersList.length,
      completed: 0,
      processing: 0,
      refunded: 0,
      failed: 0,
      canceled: 0,
    };

    for (const item of ordersList) {
      if (item.status in counts) {
        counts[item.status] += 1;
      }
    }

    return counts;
  }, [ordersList]);

  // Filtered orders
  const filteredOrders = useMemo(() => {
    let result = [...ordersList];

    // Filter by Tab
    if (activeTab !== "all") {
      result = result.filter((item) => item.status === activeTab);
    }

    // Filter by Status dropdown
    if (statusFilter !== "all") {
      result = result.filter((item) => item.status === statusFilter);
    }

    // Filter by Payment Method dropdown
    if (paymentMethodFilter !== "all") {
      result = result.filter(
        (item) => item.payment.type === paymentMethodFilter,
      );
    }

    // Filter by Search Query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(
        (item) =>
          item.orderNumber.toLowerCase().includes(query) ||
          item.invoiceNumber.toLowerCase().includes(query) ||
          item.courseTitle.toLowerCase().includes(query) ||
          item.payment.label.toLowerCase().includes(query) ||
          item.payment.brand.toLowerCase().includes(query),
      );
    }

    return result;
  }, [ordersList, activeTab, statusFilter, paymentMethodFilter, searchQuery]);

  const totalFilteredCount = filteredOrders.length;
  const totalPages = Math.max(1, Math.ceil(totalFilteredCount / pageSize));

  // Ensure currentPage doesn't exceed totalPages after filtering
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedOrders = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredOrders.slice(start, start + pageSize);
  }, [filteredOrders, safeCurrentPage, pageSize]);

  const handleTabChange = (tab: OrderHistoryTabId) => {
    setActiveTab(tab);
    setCurrentPage(1);
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    setCurrentPage(1);
  };

  return {
    orders: filteredOrders,
    paginatedOrders,
    totalFilteredCount,
    activeTab,
    setActiveTab: handleTabChange,
    searchQuery,
    setSearchQuery: handleSearchChange,
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
    tabCounts,
    selectedReceiptOrder,
    setSelectedReceiptOrder,
    resetFilters,
  };
}
