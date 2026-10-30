import { usePageSearchShortcut } from "../hooks/usePageSearchShortcut";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { ReceiptIcon as Receipt } from "@phosphor-icons/react/Receipt";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";
import type { NavigateTo } from "../routing/navigation";
import { PageHeading } from "../components/PageHeading";
import { OrderHistoryFiltersBar } from "./OrderHistoryFiltersBar";
import { OrderHistoryInvoiceModal } from "./OrderHistoryInvoiceModal";
import { OrderHistoryPagination } from "./OrderHistoryPagination";
import { OrderHistoryTable } from "./OrderHistoryTable";
import { useOrderHistoryFilter } from "./useOrderHistoryFilter";
import { ordersService } from "../services/orders";
import type { OrderHistoryItem } from "./orderHistoryData";
import { ElevatedCard } from "../components/ElevatedCard";

export interface OrderHistoryPageProps {
  onNavigatePage?: NavigateTo;
  onNavigateBack?: () => void;
  setNotice?: (message: string) => void;
}

export function OrderHistoryPage({
  onNavigatePage,
  onNavigateBack,
  setNotice,
}: OrderHistoryPageProps) {
  const {
    paginatedOrders,
    totalFilteredCount,
    totalLoadedCount,
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
    sortOrder,
    toggleSortOrder,
    selectedReceiptOrder,
    setSelectedReceiptOrder,
    resetFilters,
    isLoading,
    isError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
  } = useOrderHistoryFilter(setNotice);

  usePageSearchShortcut("order-history-search-input");

  const handleDownloadReceipt = (order: OrderHistoryItem) => {
    setNotice?.(`Downloading invoice for order ${order.orderNumber}...`);
    window.open(
      ordersService.getInvoiceDownloadUrl(order.id, "student"),
      "_blank",
      "noopener,noreferrer",
    );
  };

  const hasFilters = Boolean(
    searchQuery ||
    statusFilter !== "all" ||
    dateRangeFilter !== "all" ||
    paymentMethodFilter !== "all",
  );

  return (
    <main
      className="mx-auto flex w-full min-w-0 max-w-[1800px] flex-col gap-6 font-sans"
      aria-labelledby="order-history-page-title"
    >
      {/* Page Header */}
      <header className="flex items-start justify-between gap-5 pt-1">
        <PageHeading
          id="order-history-page-title"
          title="Purchase History"
          description="View your purchases, invoices, and payment history."
          onNavigateBack={onNavigateBack}
        />

        <span
          className="inline-flex h-12 w-12 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-2xl bg-(--accent)/12 text-(--accent)"
          aria-hidden="true"
        >
          <Receipt size={26} weight="duotone" />
        </span>
      </header>

      {/* Filter and Search Bar */}
      <OrderHistoryFiltersBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        dateRangeFilter={dateRangeFilter}
        onDateRangeFilterChange={setDateRangeFilter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        paymentMethodFilter={paymentMethodFilter}
        onPaymentMethodFilterChange={setPaymentMethodFilter}
        isFiltered={hasFilters}
        onResetFilters={resetFilters}
      />

      {/* Purchase History Content Section */}
      <section aria-label="Purchase history" className="min-w-0">
        {isLoading ? (
          <ElevatedCard as="div" className="grid min-h-72 place-items-center">
            <CircleNotch
              size={32}
              className="animate-spin text-(--accent)"
              aria-label="Loading"
            />
          </ElevatedCard>
        ) : isError ? (
          <ElevatedCard
            as="div"
            className="flex min-h-72 flex-col items-center justify-center p-6 text-center"
          >
            <WarningCircle size={30} className="mb-3 text-rose-400" />
            <h2 className="font-semibold text-(--text)">
              Unable to load purchase history
            </h2>
            <button
              type="button"
              onClick={() => void refetch()}
              className="mt-4 rounded-xl bg-(--accent) px-4 py-2 text-xs sm:text-sm font-semibold text-(--on-accent,#ffffff) shadow-sm hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer"
            >
              Try again
            </button>
          </ElevatedCard>
        ) : paginatedOrders.length > 0 ? (
          <>
            <OrderHistoryTable
              orders={paginatedOrders}
              sortOrder={sortOrder}
              onToggleSortOrder={toggleSortOrder}
              onViewInvoice={setSelectedReceiptOrder}
              onDownloadReceipt={handleDownloadReceipt}
              onNavigatePage={onNavigatePage}
              setNotice={setNotice}
            />
            {hasNextPage && (
              <div className="flex justify-center pt-4">
                <button
                  type="button"
                  onClick={() => void fetchNextPage()}
                  aria-busy={isFetchingNextPage}
                  aria-label={
                    isFetchingNextPage ? "Loading more orders" : undefined
                  }
                  disabled={isFetchingNextPage}
                  className="rounded-xl border border-(--border) bg-(--card-surface) px-5 py-2.5 text-xs md:text-sm font-semibold text-(--text) hover:bg-(--hover) transition-colors cursor-pointer disabled:cursor-wait disabled:opacity-60"
                  style={{ boxShadow: "var(--card-shadow)" }}
                >
                  {isFetchingNextPage ? (
                    <span className="inline-flex items-center">
                      <CircleNotch
                        size={15}
                        className="animate-spin text-(--accent)"
                        aria-hidden="true"
                      />
                    </span>
                  ) : (
                    "Load more orders"
                  )}
                </button>
              </div>
            )}
            {totalFilteredCount > pageSize && (
              <OrderHistoryPagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalFilteredCount={totalFilteredCount}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
              />
            )}
            <p className="mt-3 text-center text-xs text-(--muted)">
              Showing {paginatedOrders.length} of {totalFilteredCount} loaded
              orders
              {hasNextPage ? ` · ${totalLoadedCount} loaded` : ""}
            </p>
          </>
        ) : (
          <div
            className="relative flex min-h-85 sm:min-h-96 flex-col items-center justify-center overflow-hidden rounded-2xl sm:rounded-[22px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] p-8 sm:p-12 text-center shadow-(--card-shadow)"
            style={{
              background:
                "radial-gradient(ellipse 80% 60% at 50% 0%, color-mix(in srgb, var(--accent) 18%, transparent) 0%, color-mix(in srgb, var(--accent) 6%, transparent) 50%, transparent 75%), linear-gradient(180deg, color-mix(in srgb, var(--accent) 8%, var(--card-surface)) 0%, var(--card-surface) 48%, var(--card-surface) 100%)",
              boxShadow: "var(--card-shadow)",
            }}
          >
            <div
              className="mb-4 flex size-14 sm:size-16 items-center justify-center rounded-2xl sm:rounded-[20px] border border-[color-mix(in_srgb,var(--accent)_22%,transparent)] bg-[color-mix(in_srgb,var(--accent)_16%,var(--surface-strong))] text-(--accent) shadow-[0_12px_24px_color-mix(in_srgb,var(--accent-shadow)_22%,transparent)]"
              aria-hidden="true"
            >
              <Receipt size={30} weight="duotone" />
            </div>
            <h2 className="text-base sm:text-lg font-bold tracking-tight text-(--text)">
              {hasFilters
                ? hasNextPage
                  ? "No match in the purchases loaded so far"
                  : "No purchases match these filters"
                : "No purchases yet"}
            </h2>
            <p className="mt-1.5 max-w-sm text-xs sm:text-sm text-(--muted) leading-relaxed">
              {hasFilters
                ? hasNextPage
                  ? `The payment method filter looks through the ${totalLoadedCount} purchases loaded so far. Older ones have not been loaded yet.`
                  : "Try changing your search query or reset your active filters to view all orders."
                : "Your completed purchases, invoices, and payment history will appear here."}
            </p>
            {/* Status and search are answered by the server over every
                purchase, so this is reached only through the payment method
                filter, which still sees just what has been loaded. Saying
                "nothing matches" with older purchases still unloaded, and no
                way to load them, hid orders that were there. */}
            {hasFilters && hasNextPage && (
              <button
                type="button"
                onClick={() => void fetchNextPage()}
                aria-busy={isFetchingNextPage}
                disabled={isFetchingNextPage}
                className="mt-4 rounded-xl border border-(--border) bg-(--card-surface) px-5 py-2.5 text-xs md:text-sm font-semibold text-(--text) hover:bg-(--hover) transition-colors cursor-pointer disabled:cursor-wait disabled:opacity-60"
              >
                {isFetchingNextPage
                  ? "Loading older purchases…"
                  : "Load older purchases"}
              </button>
            )}
            {hasFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-(--accent) px-4 py-2 text-xs sm:text-sm font-semibold text-(--on-accent,#ffffff) shadow-sm transition-all hover:opacity-90 active:scale-[0.98] cursor-pointer"
              >
                Reset filters
              </button>
            )}
          </div>
        )}
      </section>

      {/* Invoice Modal */}
      <OrderHistoryInvoiceModal
        order={selectedReceiptOrder}
        isOpen={Boolean(selectedReceiptOrder)}
        onClose={() => setSelectedReceiptOrder(null)}
        onDownloadReceipt={handleDownloadReceipt}
      />
    </main>
  );
}
