import { lazy, Suspense, useCallback, useMemo } from "react";
import type { NeedsRefundEntry } from "@veolms/contracts";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import type { CourseRole } from "../courses/catalogue";
import { usePageSearchShortcut } from "../hooks/usePageSearchShortcut";
import type { NavigateTo } from "../routing/navigation";
import { useCurrentUser } from "../services/auth";
import { useCapabilities } from "../services/authorization";
import { useFetchOrder, useOrdersNeedingRefund } from "../services/orders";
import { useAuthStore } from "../store/auth.store";
import { getWorkspaceRoleStorageKey } from "../shell/workspaceRole";
import { ORDERS_PAGE_SIZE, useOrdersFilter } from "./useOrdersFilter";
import { DateRangeControl } from "./filters/DateRangeControl";
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

  const filters = useOrdersFilter({ enabled: isStaff });

  // Payments staff have to refund by hand (a gateway payment for an order
  // that was already paid, a course paid for twice). Usually there are
  // none, and then nothing is shown for them.
  const needsRefund = useOrdersNeedingRefund({ enabled: isStaff });
  const needsRefundEntries =
    needsRefund.data?.entries ?? NO_NEEDS_REFUND_ENTRIES;

  // An order opened from that notice need not be on this page of the list:
  // it opens by its id (kept in the URL like any open order). Fetched first,
  // so a failure is said rather than leaving a click that does nothing.
  const { selectOrder } = filters;
  const fetchOrder = useFetchOrder();
  const openFlaggedOrder = useCallback(
    (orderId: string) => {
      fetchOrder(orderId, "admin").then(
        () => selectOrder(orderId),
        () => setNotice?.("That order could not be opened. Please try again."),
      );
    },
    [fetchOrder, selectOrder, setNotice],
  );
  const closeOrder = useCallback(() => selectOrder(null), [selectOrder]);
  const courseLookup = useMemo(
    () => new Map(filters.courses.map((course) => [course.id, course])),
    [filters.courses],
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
      className="mx-auto flex w-full max-w-[1800px] flex-col gap-5 font-sans sm:gap-6"
      aria-labelledby="orders-page-title"
    >
      <header className="flex flex-col gap-4 pt-1 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1
            id="orders-page-title"
            className="m-0 text-[clamp(1.75rem,2.4vw,2.15rem)] leading-tight font-bold tracking-[-0.035em] text-(--text)"
          >
            Orders
          </h1>
          <p className="m-0 mt-1.5 text-sm leading-6 text-(--muted)">
            Manage purchases, transactions, and refunds across your academy.
          </p>
        </div>
        <DateRangeControl
          range={filters.state.range}
          customFrom={filters.state.customFrom}
          customTo={filters.state.customTo}
          onRangeChange={filters.setRange}
          onCustomRange={filters.setCustomRange}
        />
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

      <OrderFiltersBar
        state={filters.state}
        courses={filters.courses}
        coursesLoading={filters.courses.length === 0 && filters.isLoading}
        searchText={filters.searchText}
        onSearchChange={filters.setSearchText}
        onStatusesChange={filters.setStatuses}
        onCoursesChange={filters.setCourses}
        onCouponsChange={filters.setCoupons}
      />

      {/* Left out when the list was refused or failed: a row of zeros
          would read as "no sales" rather than "not loaded". */}
      {!filters.loadError && (
        <OrderSummaryCards
          stats={filters.stats}
          isLoading={filters.isLoadingStats}
          freeOnly={filters.freeOnly}
        />
      )}

      <OrdersTable
        orders={filters.orders}
        courses={filters.courses}
        total={filters.total}
        page={filters.state.page}
        pageCount={filters.pageCount}
        pageSize={ORDERS_PAGE_SIZE}
        onPageChange={filters.setPage}
        isLoading={filters.isLoading}
        isFetching={filters.isFetching}
        freeOnly={filters.freeOnly}
        selectedOrderId={filters.state.orderId}
        onSelectOrder={selectOrder}
        exportUrl={filters.exportUrl}
        onResetFilters={filters.resetFilters}
        loadError={filters.loadError}
        onRetry={filters.refetch}
      />

      {/* The open order: beside the list on a computer, over the page on a
          tablet, a sheet from the bottom on a phone. */}
      <OrderDetailsPanel
        order={filters.selectedOrder}
        courses={courseLookup}
        position={
          filters.selectedPosition
            ? { index: filters.selectedPosition, total: filters.total }
            : null
        }
        onClose={closeOrder}
        onReopen={selectOrder}
        hasPrev={filters.hasPrevOrder}
        hasNext={filters.hasNextOrder}
        onPrev={filters.selectPrevOrder}
        onNext={filters.selectNextOrder}
        onRequestRefund={filters.setRefundTargetOrder}
        onNavigatePage={onNavigatePage}
        setNotice={setNotice}
      />

      {/* Keyed per opening so one order's refund choices never carry over
          to the next. */}
      <OrderRefundModal
        key={filters.refundTargetOrder?.id ?? "closed"}
        order={filters.refundTargetOrder}
        onClose={() => filters.setRefundTargetOrder(null)}
        setNotice={setNotice}
      />
    </main>
  );
}
