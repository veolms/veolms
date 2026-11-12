import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import type {
  AdminOrder,
  OrderCourseOption,
  OrderFilterMode,
  OrderStatsResponse,
} from "@veolms/contracts";
import { useDebounceValue } from "../hooks/useDebounce";
import {
  ordersService,
  useAdminOrdersPage,
  useOrder,
  useOrderCourseOptions,
  useOrderStats,
} from "../services/orders";
import {
  DEFAULT_FILTER_STATE,
  isFreeOnlyView,
  parseFilterState,
  serializeFilterState,
  toFilterParams,
  type CourseSelection,
  type OrdersFilterState,
  type StatusKey,
} from "./ordersFilterModel";
import type { DateRangeKey } from "./ordersDateRange";

export const ORDERS_PAGE_SIZE = 10;
const NO_COURSES: readonly OrderCourseOption[] = [];
const NO_ORDERS: readonly AdminOrder[] = [];

export interface UseOrdersFilterReturn {
  state: OrdersFilterState;
  courses: readonly OrderCourseOption[];
  freeOnly: boolean;
  /** The search box's text, ahead of the URL while typing. */
  searchText: string;
  setSearchText: (text: string) => void;
  setRange: (range: Exclude<DateRangeKey, "custom">) => void;
  setCustomRange: (from: Date, to: Date) => void;
  setStatuses: (keys: readonly StatusKey[], mode: OrderFilterMode) => void;
  setCourses: (selection: CourseSelection, mode: OrderFilterMode) => void;
  setCoupons: (ids: readonly string[], mode: OrderFilterMode) => void;
  resetFilters: () => void;
  isFiltered: boolean;

  orders: readonly AdminOrder[];
  total: number;
  pageCount: number;
  setPage: (page: number) => void;
  isLoading: boolean;
  isFetching: boolean;
  loadError: "forbidden" | "failed" | null;
  refetch: () => void;
  stats: OrderStatsResponse | undefined;
  isLoadingStats: boolean;
  exportUrl: string;

  selectedOrder: AdminOrder | null;
  /** 1-based place of the open order among every matching order. */
  selectedPosition: number | null;
  selectOrder: (id: string | null) => void;
  hasPrevOrder: boolean;
  hasNextOrder: boolean;
  selectPrevOrder: () => void;
  selectNextOrder: () => void;

  refundTargetOrder: AdminOrder | null;
  setRefundTargetOrder: (order: AdminOrder | null) => void;
}

/**
 * The Orders screen's filters (kept in the URL), the page of orders they
 * select, its figures, and the order open in the panel.
 */
export function useOrdersFilter(options?: {
  enabled?: boolean;
}): UseOrdersFilterReturn {
  const enabled = options?.enabled ?? true;
  const [searchParams, setSearchParams] = useSearchParams();
  const state = useMemo(() => parseFilterState(searchParams), [searchParams]);

  const update = useCallback(
    (change: Partial<OrdersFilterState>, keepPage = false) => {
      setSearchParams(
        (current) => {
          const previous = parseFilterState(current);
          return serializeFilterState({
            ...previous,
            ...change,
            page: keepPage ? (change.page ?? previous.page) : 1,
          });
        },
        { replace: true, preventScrollReset: true },
      );
    },
    [setSearchParams],
  );

  // Search: typed text shows at once, the URL (and the request) follow.
  const [searchText, setSearchText] = useState(state.search);
  const [debouncedSearch] = useDebounceValue(searchText.trim(), 300);
  useEffect(() => {
    if (debouncedSearch !== state.search) {
      update({ search: debouncedSearch, orderId: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- follows typing only
  }, [debouncedSearch]);

  const courseOptions = useOrderCourseOptions({ enabled });
  const courses = courseOptions.data?.courses ?? NO_COURSES;

  // Recomputed with the filters, so "today" moves on with the day.
  const filterParams = useMemo(
    () => toFilterParams(state, courses, new Date()),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `state` minus page/order
    [
      state.range,
      state.customFrom,
      state.customTo,
      state.statuses,
      state.statusMode,
      state.courses,
      state.courseMode,
      state.coupons,
      state.couponMode,
      state.search,
      courses,
    ],
  );
  // The default course filter is known without the course list; anything
  // else waits for it, so ids are never sent as the wrong kind.
  const ready =
    enabled && (state.courses === "default" || courseOptions.isFetched);

  const list = useAdminOrdersPage(
    { ...filterParams, page: state.page, limit: ORDERS_PAGE_SIZE },
    { enabled: ready },
  );
  const statsQuery = useOrderStats(filterParams, { enabled: ready });

  const orders = list.data?.orders ?? NO_ORDERS;
  const total = list.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / ORDERS_PAGE_SIZE));
  const loadError =
    list.isError && !list.data
      ? list.error?.status === 403
        ? "forbidden"
        : "failed"
      : null;

  const setPage = useCallback(
    (page: number) => update({ page, orderId: null }, true),
    [update],
  );

  // The open order: from this page, or read on its own (a shared link).
  const selectedIndex = orders.findIndex((order) => order.id === state.orderId);
  const loose = useOrder(
    state.orderId && selectedIndex === -1 && list.isFetched
      ? state.orderId
      : null,
    "admin",
  );
  const looseOrder =
    loose.data && "admin" in loose.data ? (loose.data as AdminOrder) : null;
  const selectedOrder =
    selectedIndex >= 0 ? orders[selectedIndex]! : looseOrder;
  const selectedPosition =
    selectedIndex >= 0
      ? (state.page - 1) * ORDERS_PAGE_SIZE + selectedIndex + 1
      : null;

  const selectOrder = useCallback(
    (id: string | null) => update({ orderId: id }, true),
    [update],
  );

  // Stepping past either end of the page opens the next (or previous) page
  // and its first (or last) order once it has loaded.
  const pendingEdge = useRef<"first" | "last" | null>(null);
  useEffect(() => {
    if (!pendingEdge.current || list.isPlaceholderData || orders.length === 0)
      return;
    const target =
      pendingEdge.current === "first" ? orders[0] : orders[orders.length - 1];
    pendingEdge.current = null;
    if (target) selectOrder(target.id);
  }, [orders, list.isPlaceholderData, selectOrder]);

  const hasPrevOrder =
    selectedIndex > 0 || (selectedIndex === 0 && state.page > 1);
  const hasNextOrder =
    selectedIndex >= 0 &&
    (selectedIndex < orders.length - 1 || state.page < pageCount);

  const selectPrevOrder = useCallback(() => {
    if (selectedIndex > 0) selectOrder(orders[selectedIndex - 1]!.id);
    else if (selectedIndex === 0 && state.page > 1) {
      pendingEdge.current = "last";
      update({ page: state.page - 1, orderId: null }, true);
    }
  }, [selectedIndex, orders, state.page, selectOrder, update]);

  const selectNextOrder = useCallback(() => {
    if (selectedIndex < 0) return;
    if (selectedIndex < orders.length - 1) {
      selectOrder(orders[selectedIndex + 1]!.id);
    } else if (state.page < pageCount) {
      pendingEdge.current = "first";
      update({ page: state.page + 1, orderId: null }, true);
    }
  }, [selectedIndex, orders, state.page, pageCount, selectOrder, update]);

  const [refundTargetOrder, setRefundTargetOrder] = useState<AdminOrder | null>(
    null,
  );

  const resetFilters = useCallback(() => {
    setSearchText("");
    setSearchParams(serializeFilterState(DEFAULT_FILTER_STATE), {
      replace: true,
      preventScrollReset: true,
    });
  }, [setSearchParams]);

  const isFiltered =
    serializeFilterState({ ...state, page: 1, orderId: null }).toString() !==
    "";

  return {
    state,
    courses,
    freeOnly: isFreeOnlyView(state, courses),
    searchText,
    setSearchText,
    setRange: useCallback(
      (range) =>
        update({ range, customFrom: null, customTo: null, orderId: null }),
      [update],
    ),
    setCustomRange: useCallback(
      (from, to) =>
        update({
          range: "custom",
          customFrom: from,
          customTo: to,
          orderId: null,
        }),
      [update],
    ),
    setStatuses: useCallback(
      (keys, mode) =>
        update({ statuses: keys, statusMode: mode, orderId: null }),
      [update],
    ),
    setCourses: useCallback(
      (selection, mode) =>
        update({ courses: selection, courseMode: mode, orderId: null }),
      [update],
    ),
    setCoupons: useCallback(
      (ids, mode) => update({ coupons: ids, couponMode: mode, orderId: null }),
      [update],
    ),
    resetFilters,
    isFiltered,
    orders,
    total,
    pageCount,
    setPage,
    // Loading too while the previous filters' rows stand in for the new
    // ones (a filter, the range or the page changed): those rows are not
    // the answer, so the skeleton shows instead of them. A refresh of the
    // same query keeps its rows.
    isLoading: !ready || list.isLoading || list.isPlaceholderData,
    isFetching: list.isFetching,
    loadError,
    refetch: () => void list.refetch(),
    stats: statsQuery.data,
    isLoadingStats:
      !ready || statsQuery.isLoading || statsQuery.isPlaceholderData,
    exportUrl: ordersService.getOrdersExportUrl(filterParams),
    selectedOrder,
    selectedPosition,
    selectOrder,
    hasPrevOrder,
    hasNextOrder,
    selectPrevOrder,
    selectNextOrder,
    refundTargetOrder,
    setRefundTargetOrder,
  };
}
