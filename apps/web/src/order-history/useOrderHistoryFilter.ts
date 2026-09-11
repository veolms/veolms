import { useMemo, useState } from "react";
import type {
  OrderHistoryItem,
  OrderHistoryTabId,
} from "./orderHistoryData";
import { useOrders } from "../services/orders";
import { adaptOrderToOrderHistoryItem } from "../orders/orderAdapter";

export interface UseOrderHistoryFilterReturn {
  orders: readonly OrderHistoryItem[];
  paginatedOrders: readonly OrderHistoryItem[];
  totalFilteredCount: number;
  totalLoadedCount: number;
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
  isLoading: boolean;
  isError: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  refetch: () => void;
}

export function useOrderHistoryFilter(
  setNotice?: (message: string) => void,
): UseOrderHistoryFilterReturn {
  const {
    data,
    isLoading,
    isError,
    hasNextPage = false,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
  } = useOrders();

  const [activeTab, setActiveTab] = useState<OrderHistoryTabId>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRangeFilter, setDateRangeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedReceiptOrder, setSelectedReceiptOrder] =
    useState<OrderHistoryItem | null>(null);

  const pageSize = 10;

  const rawOrders = useMemo(() => {
    return data?.pages.flatMap((page) => page.orders) || [];
  }, [data?.pages]);

  const ordersList = useMemo(() => {
    return rawOrders.map(adaptOrderToOrderHistoryItem);
  }, [rawOrders]);

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
  const safeCurrentPage = Math.min(currentPage, totalPages);

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
    paginatedOrders: filteredOrders,
    totalFilteredCount,
    totalLoadedCount: ordersList.length,
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
    isLoading,
    isError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
  };
}
