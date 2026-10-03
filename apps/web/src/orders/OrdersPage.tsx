import { lazy, Suspense, useEffect, useMemo } from "react";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { ShoppingBagIcon as ShoppingBag } from "@phosphor-icons/react/ShoppingBag";
import type { CourseRole } from "../courses/catalogue";
import type { NavigateTo } from "../routing/navigation";
import { useCurrentUser } from "../services/auth";
import { useAuthStore } from "../store/auth.store";
import { getUserRoles, getWorkspaceRoleStorageKey, isStaffRole } from "../shell/workspaceRole";
import { useOrdersFilter } from "./useOrdersFilter";
import { OrderSummaryCards } from "./OrderSummaryCards";
import { OrderFiltersBar } from "./OrderFiltersBar";
import { OrdersTable } from "./OrdersTable";
import { OrderDetailsDrawer } from "./OrderDetailsDrawer";
import { OrderRefundModal } from "./OrderRefundModal";

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

export function OrdersPage({ onNavigatePage, setNotice, role }: OrdersPageProps) {
  const { data: authUser, isFetched: authUserFetched } = useCurrentUser();
  const storeUser = useAuthStore((s) => s.user);
  const isAuthReady = Boolean(storeUser) || authUserFetched;
  const user = authUserFetched ? authUser : storeUser;
  const userRoles = getUserRoles(user);

  // Resolve active workspace role (respecting role switcher)
  const activeRole = useMemo(() => {
    if (role === "student") return "student";
    if (role === "creator") return "creator";
    if (typeof window === "undefined") return "student";
    try {
      const key = getWorkspaceRoleStorageKey(user?.id);
      const stored = localStorage.getItem(key) || localStorage.getItem("veolms-role");
      return stored === "creator" ? "creator" : "student";
    } catch {
      return "student";
    }
  }, [role, user?.id]);

  const isStaff = Boolean(user && isStaffRole(userRoles) && activeRole !== "student");

  const filterState = useOrdersFilter({ enabled: isStaff });

  // Keyboard shortcut listener (/ or Cmd+K to focus search input)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || "").toLowerCase();
      const isInput =
        activeTag === "input" ||
        activeTag === "textarea" ||
        (document.activeElement as HTMLElement)?.isContentEditable;

      if (
        !isInput &&
        (event.key === "/" || ((event.metaKey || event.ctrlKey) && event.key === "k"))
      ) {
        event.preventDefault();
        document.getElementById("orders-search-input")?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Waiting for authentication
  if (!isAuthReady) {
    return (
      <main
        className="mx-auto grid min-h-52 w-full max-w-[1360px] place-items-center py-24"
        role="status"
        aria-label="Loading orders dashboard"
      >
        <CircleNotch size={32} className="animate-spin text-(--accent)" aria-hidden="true" />
      </main>
    );
  }

  // When active role is student or non-staff: seamlessly render Student Order History
  if (!isStaff || activeRole === "student") {
    return (
      <Suspense
        fallback={
          <div className="grid min-h-52 place-items-center" aria-label="Loading order history">
            <CircleNotch size={26} className="animate-spin text-(--accent)" />
          </div>
        }
      >
        <OrderHistoryPageRoute onNavigatePage={onNavigatePage} setNotice={setNotice} />
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
            className="text-[clamp(1.8rem,2.4vw,2.15rem)] leading-tight font-bold tracking-[-0.035em] text-(--text)"
          >
            Orders
          </h1>
          <p className="mt-1.5 text-[0.88rem] leading-6 text-(--muted)">
            Manage purchases, transactions, and refunds across your academy.
          </p>
        </div>

        <span
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-(--accent)/12 text-(--accent) sm:h-14 sm:w-14"
          aria-hidden="true"
        >
          <ShoppingBag size={26} weight="duotone" />
        </span>
      </header>

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

      {/* 4 KPI Summary Cards */}
      <OrderSummaryCards stats={filterState.stats} isLoading={filterState.isLoadingStats} />

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
      />

      {/* Slide-over Order Details Drawer */}
      <OrderDetailsDrawer
        order={filterState.selectedOrder}
        onClose={() => filterState.setSelectedOrderId(null)}
        hasPrev={filterState.hasPrevOrder}
        hasNext={filterState.hasNextOrder}
        onPrev={filterState.selectPrevOrder}
        onNext={filterState.selectNextOrder}
        onRequestRefund={filterState.setRefundTargetOrder}
        onNavigatePage={onNavigatePage}
        setNotice={setNotice}
      />

      {/* Refund Modal */}
      <OrderRefundModal
        order={filterState.refundTargetOrder}
        onClose={() => filterState.setRefundTargetOrder(null)}
        setNotice={setNotice}
      />
    </main>
  );
}
