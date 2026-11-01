import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import type { NeedsRefundEntry } from "@veolms/contracts";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { ShoppingBagIcon as ShoppingBag } from "@phosphor-icons/react/ShoppingBag";
import type { CourseRole } from "../courses/catalogue";
import { usePageSearchShortcut } from "../hooks/usePageSearchShortcut";
import type { NavigateTo } from "../routing/navigation";
import { useCurrentUser } from "../services/auth";
import { useCapabilities } from "../services/authorization";
import {
  useFetchOrder,
  useOrder,
  useOrdersNeedingRefund,
} from "../services/orders";
import { useAuthStore } from "../store/auth.store";
import { getWorkspaceRoleStorageKey } from "../shell/workspaceRole";
import { useOrdersFilter } from "./useOrdersFilter";
import { OrderSummaryCards } from "./OrderSummaryCards";
import { OrderFiltersBar } from "./OrderFiltersBar";
import { OrdersTable } from "./OrdersTable";
import { OrderDetailsPanel } from "./OrderDetailsPanel";
import { OrderRefundModal } from "./OrderRefundModal";
import { NeedsRefundNotice } from "./NeedsRefundNotice";

const NO_NEEDS_REFUND_ENTRIES: readonly NeedsRefundEntry[] = [];

const OrderHistoryPageRoute = lazy(() =>
  import("../order-history/OrderHistoryPage").then((module) => ({
    default: module.OrderHistoryPage,
  })),
);

export interface OrdersPageProps {
  onNavigatePage?: NavigateTo;
  setNotice?: (message: string) => void;
  role?: CourseRole;
}

export function OrdersPage({
  onNavigatePage,
  setNotice,
  role,
}: OrdersPageProps) {
  const { data: authUser, isFetched: authUserFetched } = useCurrentUser();
  const storeUser = useAuthStore((s) => s.user);
  const isAuthReady = Boolean(storeUser) || authUserFetched;
  const user = authUserFetched ? authUser : storeUser;

  // Resolve active workspace role (respecting role switcher)
  const activeRole = useMemo(() => {
    if (role === "student") return "student";
    if (role === "creator") return "creator";
    if (typeof window === "undefined") return "student";
    try {
      const key = getWorkspaceRoleStorageKey(user?.id);
      const stored =
        localStorage.getItem(key) || localStorage.getItem("veolms-role");
      return stored === "creator" ? "creator" : "student";
    } catch {
      return "student";
    }
  }, [role, user?.id]);

  // The staff screen is for whoever may read the academy's orders.
  const capabilities = useCapabilities({
    enabled: Boolean(user) && activeRole !== "student",
  });
  const isStaff = Boolean(
    user && capabilities.can("billing.read") && activeRole !== "student",
  );

  const filterState = useOrdersFilter({ enabled: isStaff });

  // Payments staff have to refund by hand (a gateway payment for an order
  // that was already paid, a course paid for twice). Usually there are
  // none, and then nothing is shown for them.
  const needsRefund = useOrdersNeedingRefund({ enabled: isStaff });
  const needsRefundEntries =
    needsRefund.data?.entries ?? NO_NEEDS_REFUND_ENTRIES;

  // An order opened from that notice need not be among the rows the table
  // has loaded (they follow the filters and the date range), so it is read
  // by its id. Fetched before the drawer is asked to open, so a failure is
  // said rather than leaving a click that does nothing.
  const { setSelectedOrderId } = filterState;
  const fetchOrder = useFetchOrder();
  const [flaggedOrderId, setFlaggedOrderId] = useState<string | null>(null);
  const { data: flaggedOrderData } = useOrder(flaggedOrderId, "admin");
  const flaggedOrder =
    flaggedOrderId && flaggedOrderData && "admin" in flaggedOrderData
      ? flaggedOrderData
      : null;

  const openFlaggedOrder = useCallback(
    (orderId: string) => {
      fetchOrder(orderId, "admin").then(
        () => {
          setSelectedOrderId(null);
          setFlaggedOrderId(orderId);
        },
        () => setNotice?.("That order could not be opened. Please try again."),
      );
    },
    [fetchOrder, setSelectedOrderId, setNotice],
  );

  const closeOrderDrawer = useCallback(() => {
    setSelectedOrderId(null);
    setFlaggedOrderId(null);
  }, [setSelectedOrderId]);

  // The desktop panel's gutter opens the order it showed last: from the
  // list when it is still there, else as the flagged order was opened.
  const reopenOrder = useCallback(
    (orderId: string) => {
      if (filterState.orders.some((order) => order.id === orderId)) {
        setSelectedOrderId(orderId);
      } else {
        setFlaggedOrderId(orderId);
      }
    },
    [filterState.orders, setSelectedOrderId],
  );

  usePageSearchShortcut("orders-search-input");

  // Waiting for authentication, and for what this account may do
  if (!isAuthReady || capabilities.isLoading) {
    return (
      <main
        className="mx-auto grid min-h-52 w-full max-w-[1360px] place-items-center py-24"
        role="status"
        aria-label="Loading orders dashboard"
      >
        <CircleNotch
          size={32}
          className="animate-spin text-(--accent)"
          aria-hidden="true"
        />
      </main>
    );
  }

  // When active role is student or non-staff: seamlessly render Student Order History
  if (!isStaff || activeRole === "student") {
    return (
      <Suspense
        fallback={
          <div
            className="grid min-h-52 place-items-center"
            aria-label="Loading order history"
          >
            <CircleNotch size={26} className="animate-spin text-(--accent)" />
          </div>
        }
      >
        <OrderHistoryPageRoute
          onNavigatePage={onNavigatePage}
          setNotice={setNotice}
        />
      </Suspense>
    );
  }

  return (
    <main
      data-orders-surface=""
      className="mx-auto flex w-full max-w-[1800px] flex-col gap-6 font-sans"
      aria-labelledby="orders-page-title"
    >
      {/* Top Header Row with Title, Description, and Header Icon Badge */}
      <header className="flex items-start justify-between gap-5 pt-1">
        <div>
          <h1
            id="orders-page-title"
            className="text-[clamp(1.8rem,2.4vw,2.15rem)] font-bold leading-tight tracking-[-0.035em] text-(--text)"
          >
            Orders
          </h1>
          <p className="mt-1.5 text-[0.88rem] leading-6 text-(--muted)">
            Manage purchases, transactions, and refunds across your academy.
          </p>
        </div>

        <span
          className="inline-flex h-12 w-12 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-2xl bg-(--accent)/12 text-(--accent)"
          aria-hidden="true"
        >
          <ShoppingBag size={26} weight="duotone" />
        </span>
      </header>

      {/* Payments that need a manual refund. Renders nothing when there are
          none, which is the usual case. */}
      <NeedsRefundNotice
        entries={needsRefundEntries}
        hasMore={Boolean(needsRefund.data?.nextCursor)}
        onOpenOrder={openFlaggedOrder}
        canRejectTransfers={capabilities.can("payment.manual.verify")}
        setNotice={setNotice}
      />

      {/* Filter toolbar card: placed ON TOP of stats cards as requested */}
      <OrderFiltersBar
        searchQuery={filterState.searchQuery}
        onSearchChange={filterState.setSearchQuery}
        courseFilter={filterState.courseFilter}
        onCourseFilterChange={filterState.setCourseFilter}
        couponFilter={filterState.couponFilter}
        onCouponFilterChange={filterState.setCouponFilter}
        statusFilter={filterState.statusFilter}
        onStatusFilterChange={filterState.setStatusFilter}
        datePreset={filterState.datePreset}
        dateLabel={filterState.dateLabel}
        onDatePresetChange={filterState.setDatePreset}
        isFiltered={filterState.isFiltered}
        onResetFilters={filterState.resetFilters}
      />

      {/* 4 KPI Summary Cards. Left out when the orders list was refused or
          failed and no stats arrived either (they need the same permission):
          a row of zeros read as "no sales" rather than "not loaded". */}
      {!(filterState.loadError && !filterState.stats) && (
        <OrderSummaryCards
          stats={filterState.stats}
          isLoading={filterState.isLoadingStats}
        />
      )}

      {/* Virtualized Orders Table */}
      <OrdersTable
        orders={filterState.orders}
        isLoading={filterState.isLoading}
        hasNextPage={filterState.hasNextPage}
        isFetchingNextPage={filterState.isFetchingNextPage}
        fetchNextPage={filterState.fetchNextPage}
        sortOrder={filterState.sortOrder}
        onToggleSortOrder={filterState.toggleSortOrder}
        selectedOrderId={filterState.selectedOrderId}
        onSelectOrder={filterState.setSelectedOrderId}
        onRequestRefund={filterState.setRefundTargetOrder}
        onNavigatePage={onNavigatePage}
        setNotice={setNotice}
        isFiltered={filterState.isFiltered}
        onResetFilters={filterState.resetFilters}
        loadError={filterState.loadError}
        onRetry={filterState.refetch}
        layoutRevision={needsRefundEntries.length}
      />

      {/* The open order, in the Discussions page's side panel. A row
          picked in the table, or failing that the order opened from the
          refund notice. */}
      <OrderDetailsPanel
        order={filterState.selectedOrder ?? flaggedOrder}
        onClose={closeOrderDrawer}
        onReopen={reopenOrder}
        hasPrev={filterState.hasPrevOrder}
        hasNext={filterState.hasNextOrder}
        onPrev={filterState.selectPrevOrder}
        onNext={filterState.selectNextOrder}
        onRequestRefund={filterState.setRefundTargetOrder}
        onNavigatePage={onNavigatePage}
        setNotice={setNotice}
      />

      {/* Refund Modal. Keyed per opening so the refund type, amount, reason
          and "preserve access" tick of one order never carry over to the
          next one. */}
      <OrderRefundModal
        key={filterState.refundTargetOrder?.id ?? "closed"}
        order={filterState.refundTargetOrder}
        onClose={() => filterState.setRefundTargetOrder(null)}
        setNotice={setNotice}
      />
    </main>
  );
}
