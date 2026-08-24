import { useEffect, useRef } from "react";
import { ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { Clock } from "@phosphor-icons/react/Clock";
import { Prohibit } from "@phosphor-icons/react/Prohibit";
import { Receipt } from "@phosphor-icons/react/Receipt";
import { ShoppingBag } from "@phosphor-icons/react/ShoppingBag";
import { XCircle } from "@phosphor-icons/react/XCircle";
import type { NavigateTo } from "../routing/navigation";
import type { OrderHistoryTabId } from "./orderHistoryData";
import { OrderHistoryFiltersBar } from "./OrderHistoryFiltersBar";
import { OrderHistoryInvoiceModal } from "./OrderHistoryInvoiceModal";
import { OrderHistoryPagination } from "./OrderHistoryPagination";
import { OrderHistoryTable } from "./OrderHistoryTable";
import { useOrderHistoryFilter } from "./useOrderHistoryFilter";

export interface OrderHistoryPageProps {
  onNavigatePage?: NavigateTo;
  setNotice?: (message: string) => void;
}

const tabsConfig: readonly {
  id: OrderHistoryTabId;
  label: string;
  Icon: typeof Receipt;
}[] = [
  { id: "all", label: "All Orders", Icon: Receipt },
  { id: "completed", label: "Completed", Icon: CheckCircle },
  { id: "processing", label: "Processing", Icon: Clock },
  { id: "refunded", label: "Refunded", Icon: ArrowCounterClockwise },
  { id: "failed", label: "Failed", Icon: XCircle },
  { id: "canceled", label: "Canceled", Icon: Prohibit },
];

export function OrderHistoryPage({
  onNavigatePage,
  setNotice,
}: OrderHistoryPageProps) {
  const {
    paginatedOrders,
    totalFilteredCount,
    activeTab,
    setActiveTab,
    searchQuery,
    setSearchQuery,
    dateRangeFilter,
    setDateRangeFilter,
    statusFilter,
    setStatusFilter,
    paymentMethodFilter,
    setPaymentMethodFilter,
    currentPage,
    setCurrentPage,
    pageSize,
    totalPages,
    tabCounts,
    selectedReceiptOrder,
    setSelectedReceiptOrder,
    resetFilters,
  } = useOrderHistoryFilter(setNotice);

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
          document.getElementById("order-history-search-input")?.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleDownloadReceipt = (order: typeof selectedReceiptOrder) => {
    if (!order) return;
    setNotice?.(
      `Downloading invoice ${order.invoiceNumber} for order ${order.orderNumber}...`,
    );
  };

  return (
    <div
      className="w-full min-w-0 flex flex-col font-sans"
      aria-labelledby="order-history-page-title"
    >
      {/* Top Header Row with Title, Description, and Header Icon Badge */}
      <header className="flex items-start justify-between gap-5 mb-6">
        <div>
          <h1
            id="order-history-page-title"
            className="text-[clamp(1.9rem,3.4vw,2.7rem)] font-[740] tracking-[-0.055em] leading-[1.02] text-[var(--text)]"
          >
            Order History
          </h1>
          <p className="mt-2 text-[0.92rem] text-[var(--muted)] leading-[1.5]">
            Review your academy purchases and payment activity.
          </p>
        </div>
        <span
          className="inline-flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-[19px] text-[var(--accent)] transition-transform hover:scale-105"
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

      {/* Tab Navigation Bar with delicate thin bottom line and icons */}
      <nav
        aria-label="Order history categories"
        className="mb-5 flex min-w-0 gap-1 md:gap-3 overflow-x-auto bg-transparent border-b border-[color-mix(in_srgb,var(--text)_9%,transparent)] scrollbar-none"
        role="tablist"
      >
        {tabsConfig.map((tab, idx) => {
          const isActive = activeTab === tab.id;
          const count = tabCounts[tab.id];
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
              className={`relative inline-flex min-h-[46px] flex-shrink-0 items-center gap-2 px-3.5 pb-2.5 pt-1 text-xs md:text-sm font-[650] transition-colors cursor-pointer select-none ${
                isActive
                  ? "text-[var(--text)]"
                  : "text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              <Icon
                size={18}
                weight={isActive ? "fill" : "regular"}
                className={
                  isActive ? "text-[var(--accent)]" : "text-[var(--muted)]"
                }
              />
              <span>
                {tab.label} ({count})
              </span>
              {isActive && (
                <span
                  className="absolute bottom-0 left-0 right-0 h-[2.5px] rounded-t-full bg-[var(--accent)]"
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Filter and Search Toolbar */}
      <section aria-label="Order history filters" className="mb-5">
        <OrderHistoryFiltersBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          dateRangeFilter={dateRangeFilter}
          onDateRangeFilterChange={setDateRangeFilter}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          paymentMethodFilter={paymentMethodFilter}
          onPaymentMethodFilterChange={setPaymentMethodFilter}
        />
      </section>

      {/* Orders Table Feed */}
      <section aria-label="Orders history list" className="flex flex-col gap-4">
        {paginatedOrders.length > 0 ? (
          <>
            <OrderHistoryTable
              orders={paginatedOrders}
              onViewInvoice={setSelectedReceiptOrder}
              setNotice={setNotice}
            />

            {/* Pagination Controls */}
            <OrderHistoryPagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalFilteredCount={totalFilteredCount}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
            />
          </>
        ) : (
          <div
            className="flex flex-col items-center justify-center rounded-[18px] border border-[var(--border)] bg-[var(--card-surface)] p-12 text-center"
            style={{ boxShadow: "var(--card-shadow)" }}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--hover)] text-[var(--muted)] mb-3">
              <Receipt size={24} />
            </div>
            <h3 className="text-base font-semibold text-[var(--text)]">
              No order records found
            </h3>
            <p className="mt-1 max-w-sm text-xs md:text-sm text-[var(--muted)]">
              {searchQuery ||
              statusFilter !== "all" ||
              dateRangeFilter !== "all" ||
              paymentMethodFilter !== "all"
                ? "Try changing your search query or reset your active filters to view all orders."
                : "There are no orders in this category."}
            </p>
            <button
              type="button"
              onClick={resetFilters}
              className="mt-4 rounded-xl bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--on-accent,#ffffff)] shadow-sm hover:opacity-90 cursor-pointer"
            >
              Reset filters
            </button>
          </div>
        )}
      </section>

      {/* Invoice Modal Dialog */}
      <OrderHistoryInvoiceModal
        order={selectedReceiptOrder}
        isOpen={Boolean(selectedReceiptOrder)}
        onClose={() => setSelectedReceiptOrder(null)}
        onDownloadReceipt={handleDownloadReceipt}
      />
    </div>
  );
}
