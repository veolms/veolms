import { useEffect, useRef } from "react";
import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { ClockIcon as Clock } from "@phosphor-icons/react/Clock";
import { ReceiptIcon as Receipt } from "@phosphor-icons/react/Receipt";
import { ShoppingBagIcon as ShoppingBag } from "@phosphor-icons/react/ShoppingBag";
import { XCircleIcon as XCircle } from "@phosphor-icons/react/XCircle";
import type { NavigateTo } from "../routing/navigation";
import { OrderCard } from "./OrderCard";
import { OrderFiltersBar } from "./OrderFiltersBar";
import { OrderReceiptModal } from "./OrderReceiptModal";
import type { OrderTabId } from "./ordersData";
import { OrderSummaryWidget } from "./OrderSummaryWidget";
import { RecentPaymentsWidget } from "./RecentPaymentsWidget";
import { useOrdersFilter } from "./useOrdersFilter";

export interface OrdersPageProps {
  onNavigatePage?: NavigateTo;
  setNotice?: (message: string) => void;
}

const tabsConfig: readonly {
  id: OrderTabId;
  label: string;
  Icon: typeof Receipt;
}[] = [
  { id: "all", label: "All", Icon: Receipt },
  { id: "completed", label: "Completed", Icon: CheckCircle },
  { id: "pending", label: "Pending", Icon: Clock },
  { id: "failed", label: "Failed", Icon: XCircle },
  { id: "refunded", label: "Refunded", Icon: ArrowCounterClockwise },
];

export function OrdersPage({ onNavigatePage, setNotice }: OrdersPageProps) {
  const {
    orders,
    orderSummary,
    recentPayments,
    totalFilteredCount,
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
  } = useOrdersFilter(setNotice);

  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Keyboard shortcut listener (/ or Cmd+K to search)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || "").toLowerCase();
      const isInput =
        activeTag === "input" ||
        activeTag === "textarea" ||
        (document.activeElement as HTMLElement)?.isContentEditable;

      if (!isInput) {
        if (e.key === "/" || ((e.metaKey || e.ctrlKey) && e.key === "k")) {
          e.preventDefault();
          document.getElementById("orders-search-input")?.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleDownloadReceipt = (order: typeof selectedReceiptOrder) => {
    if (!order) return;
    setNotice?.(`Downloading receipt for order ${order.orderNumber}...`);
  };

  return (
    <div
      className="w-full min-w-0 flex flex-col font-sans"
      aria-labelledby="orders-page-title"
    >
      {/* Top Header Row with Title, Description, and Header Icon Badge */}
      <header className="flex items-start justify-between gap-5 mb-6">
        <div>
          <h1
            id="orders-page-title"
            className="text-[clamp(1.9rem,3.4vw,2.7rem)] font-[740] tracking-[-0.055em] leading-[1.02] text-(--text)"
          >
            Orders
          </h1>
          <p className="mt-2 text-[0.92rem] text-(--muted) leading-normal">
            Track your purchases, payment status, and active course orders.
          </p>
        </div>
        <span
          className="inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-[19px] text-(--accent) transition-transform hover:scale-105"
          style={{
            background: "color-mix(in srgb, var(--accent) 16%, var(--surface))",
            boxShadow:
              "0 14px 26px color-mix(in srgb, var(--accent-shadow) 40%, transparent)",
          }}
          aria-hidden="true"
        >
          <ShoppingBag size={28} weight="duotone" />
        </span>
      </header>

      {/* Tab Navigation Bar with delicate thin bottom line and prominent active underline */}
      <nav
        aria-label="Order status categories"
        className="scrollbar-none mb-5 flex min-w-0 gap-1 overflow-x-auto border-b border-[color-mix(in_srgb,var(--text)_9%,transparent)] bg-transparent md:gap-3"
        role="tablist"
      >
        {tabsConfig.map((tab, idx) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.Icon;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[idx] = el;
              }}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              className={`relative inline-flex min-h-11.5 shrink-0 items-center gap-2 px-3.5 pb-2.5 pt-1 text-xs md:text-sm font-[650] transition-colors cursor-pointer select-none ${
                isActive
                  ? "text-(--text)"
                  : "text-(--muted) hover:text-(--text)"
              }`}
            >
              <Icon
                size={18}
                weight={isActive ? "fill" : "regular"}
                className={
                  isActive ? "text-(--accent)" : "text-(--muted)"
                }
              />
              <span>{tab.label}</span>
              {isActive && (
                <span
                  className="absolute bottom-0 left-0 right-0 h-[2.5px] rounded-t-full bg-(--accent)"
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Filter and Search Toolbar */}
      <section aria-label="Order filters" className="mb-5">
        <OrderFiltersBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          courseFilter={courseFilter}
          onCourseFilterChange={setCourseFilter}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
        />
      </section>

      {/* Responsive Layout: 1 column on <=150% zoom / tablets, 2 columns on >=1280px / 100% zoom */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12 xl:items-start">
        {/* Left / Main Column: Orders Feed (Full width on zoom, 8 of 12 columns on desktop) */}
        <main className="flex flex-col gap-3.5 xl:col-span-8 min-w-0">
          {orders.length > 0 ? (
            orders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                onViewReceipt={setSelectedReceiptOrder}
                setNotice={setNotice}
              />
            ))
          ) : (
            <div
              className="flex flex-col items-center justify-center rounded-[18px] border border-(--border) bg-(--card-surface) p-12 text-center"
              style={{ boxShadow: "var(--card-shadow)" }}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-(--hover) text-(--muted) mb-3">
                <Receipt size={24} />
              </div>
              <h3 className="text-base font-semibold text-(--text)">
                No orders found
              </h3>
              <p className="mt-1 max-w-sm text-xs md:text-sm text-(--muted)">
                {searchQuery || courseFilter !== "all" || statusFilter !== "all"
                  ? "Try changing your search query or reset your active filters to view all orders."
                  : "There are no orders in this category."}
              </p>
              <button
                type="button"
                onClick={resetFilters}
                className="mt-4 rounded-xl bg-(--accent) px-4 py-2 text-xs font-semibold text-(--on-accent,#ffffff) shadow-sm hover:opacity-90 cursor-pointer"
              >
                Reset filters
              </button>
            </div>
          )}

          {/* Showing orders count indicator */}
          {orders.length > 0 && (
            <div className="mt-2 flex items-center justify-center pt-2">
              <button
                type="button"
                onClick={() => setNotice?.("All orders currently loaded.")}
                className="rounded-xl border border-(--border) bg-(--card-surface) px-5 py-2.5 text-xs md:text-sm font-medium text-(--muted) hover:bg-(--hover) hover:text-(--text) transition-colors cursor-pointer"
                style={{ boxShadow: "var(--card-shadow)" }}
              >
                Showing {totalFilteredCount} of {orderSummary.totalOrders}{" "}
                orders
              </button>
            </div>
          )}
        </main>

        {/* Right Column / Subgrid: Sidebar Widgets (2 side-by-side on 150% zoom, 1 stacked on desktop) */}
        <aside className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 gap-5 xl:col-span-4 min-w-0">
          {/* Order Summary Widget */}
          <OrderSummaryWidget
            summary={orderSummary}
            onSelectStatusFilter={(status) => setActiveTab(status)}
          />

          {/* Recent Payments Widget */}
          <RecentPaymentsWidget
            payments={recentPayments}
            onViewAll={() => resetFilters()}
            onOpenBillingHistory={() =>
              setNotice?.("Full billing statement downloaded to your device.")
            }
          />
        </aside>
      </div>

      {/* Order Receipt Modal Dialog */}
      <OrderReceiptModal
        order={selectedReceiptOrder}
        isOpen={Boolean(selectedReceiptOrder)}
        onClose={() => setSelectedReceiptOrder(null)}
        onDownloadReceipt={handleDownloadReceipt}
      />
    </div>
  );
}
