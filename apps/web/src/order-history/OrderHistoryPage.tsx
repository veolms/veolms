import { useEffect } from "react";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { ReceiptIcon as Receipt } from "@phosphor-icons/react/Receipt";
import { XIcon as X } from "@phosphor-icons/react/X";
import type { NavigateTo } from "../routing/navigation";
import {
  SEARCH_SHORTCUT_ARIA_KEYSHORTCUTS,
  SearchShortcutHint,
} from "../searchShortcut";
import { OrderHistoryTable } from "./OrderHistoryTable";
import { useOrderHistoryFilter } from "./useOrderHistoryFilter";
import { ordersService } from "../services/orders";

export interface OrderHistoryPageProps {
  onNavigatePage?: NavigateTo;
  setNotice?: (message: string) => void;
}

export function OrderHistoryPage({
  onNavigatePage,
  setNotice,
}: OrderHistoryPageProps) {
  const {
    orders,
    searchQuery,
    setSearchQuery,
    sortOrder,
    toggleSortOrder,
    isLoading,
    isError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
  } = useOrderHistoryFilter();

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
        (event.key === "/" ||
          ((event.metaKey || event.ctrlKey) && event.key === "k"))
      ) {
        event.preventDefault();
        document.getElementById("order-history-search-input")?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const downloadInvoice = (order: (typeof orders)[number]) => {
    window.open(
      ordersService.getInvoiceDownloadUrl(order.id, "student"),
      "_blank",
      "noopener,noreferrer",
    );
  };

  const viewCourse = (order: (typeof orders)[number]) => {
    const course = order.items?.find((item) => item.courseId);
    if (!course?.courseId) {
      setNotice?.("This course is no longer available.");
      return;
    }
    onNavigatePage?.("/courses/" + encodeURIComponent(course.courseId) + "/overview");
  };

  const getSupport = (order: (typeof orders)[number]) => {
    const subject = encodeURIComponent("Order support: " + order.orderNumber);
    window.location.assign("mailto:support@procodrr.com?subject=" + subject);
  };

  return (
    <main className="mx-auto flex w-full min-w-0 max-w-[1600px] flex-col gap-5 px-3 pb-8 sm:px-6 sm:pb-12" aria-labelledby="order-history-title">
      <header className="flex flex-col justify-between gap-4 pt-1 sm:flex-row sm:items-end">
        <div className="min-w-0">
          <h1 id="order-history-title" className="text-[clamp(1.9rem,3.4vw,2.7rem)] font-[740] leading-[1.02] tracking-[-0.055em] text-(--text)">
            Purchase History
          </h1>
          <p className="mt-2 text-sm text-(--muted) sm:text-base">
            View your purchases, invoices, and payment history.
          </p>
        </div>
        <div
          className="w-full sm:max-w-120 rounded-[15px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface) p-2 sm:p-2.5 transition-all shadow-(--card-shadow)"
          style={{ boxShadow: "var(--card-shadow)" }}
        >
          <label className="flex min-h-10 w-full items-center gap-2.5 rounded-[9px] bg-[color-mix(in_srgb,var(--surface-strong)_72%,var(--canvas))] px-3 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_20%,transparent)] focus-within:shadow-[inset_0_0_0_1px_var(--accent),0_0_0_3px_color-mix(in_srgb,var(--accent)_16%,transparent)] transition-all cursor-text">
            <MagnifyingGlass
              size={17}
              className="text-(--muted) shrink-0"
              aria-hidden="true"
            />
            <input
              id="order-history-search-input"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search your orders, courses, or invoices..."
              aria-label="Search your orders, courses, or invoices"
              aria-keyshortcuts={SEARCH_SHORTCUT_ARIA_KEYSHORTCUTS}
              data-search-shortcut-target
              className="w-full border-0 bg-transparent p-0 text-xs md:text-sm text-(--text-secondary) placeholder-(--muted) outline-none"
            />
            <SearchShortcutHint />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
                className="text-(--muted) hover:text-(--text) cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </label>
        </div>
      </header>

      <section aria-label="Purchase history orders" aria-busy={isLoading}>
        {isLoading ? (
          <div
            className="grid min-h-80 place-items-center rounded-2xl sm:rounded-[22px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface) shadow-(--card-shadow)"
            style={{ boxShadow: "var(--card-shadow)" }}
          >
            <CircleNotch size={32} className="animate-spin text-(--accent)" aria-label="Loading" />
          </div>
        ) : isError ? (
          <div
            className="flex min-h-64 flex-col items-center justify-center rounded-2xl sm:rounded-[22px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface) p-8 text-center shadow-(--card-shadow)"
            style={{ boxShadow: "var(--card-shadow)" }}
          >
            <p className="text-sm font-medium text-(--text)">Unable to load purchase history.</p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="mt-3.5 rounded-lg bg-(--accent) px-4 py-2 text-xs sm:text-sm font-semibold text-(--on-accent,#fff) transition-all hover:opacity-90 active:scale-[0.98] cursor-pointer"
            >
              Try again
            </button>
          </div>
        ) : orders.length > 0 ? (
          <div className="flex min-w-0 flex-col gap-4">
            <OrderHistoryTable
              orders={orders}
              sortOrder={sortOrder}
              onToggleSortOrder={toggleSortOrder}
              onDownloadInvoice={downloadInvoice}
              onViewCourse={viewCourse}
              onGetSupport={getSupport}
            />
            {hasNextPage && (
              <button
                type="button"
                onClick={() => void fetchNextPage()}
                disabled={isFetchingNextPage}
                className="mx-auto min-h-11 rounded-xl border border-(--border) bg-(--card-surface) px-5 text-sm font-semibold text-(--text) shadow-(--card-shadow) transition-colors hover:bg-(--hover) disabled:cursor-wait disabled:opacity-60"
                style={{ boxShadow: "var(--card-shadow)" }}
              >
                {isFetchingNextPage ? (
                  <span className="inline-flex items-center gap-2"><CircleNotch size={16} className="animate-spin" />Loading</span>
                ) : "Load more"}
              </button>
            )}
          </div>
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
              No purchases found
            </h2>
            <p className="mt-1.5 max-w-sm text-xs sm:text-sm text-(--muted) leading-relaxed">
              {searchQuery
                ? "Try a different order, course, or invoice search."
                : "Your completed purchases will appear here."}
            </p>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-(--accent) px-4 py-2 text-xs sm:text-sm font-semibold text-(--on-accent,#fff) shadow-sm transition-all hover:opacity-90 active:scale-[0.98] cursor-pointer"
              >
                Clear search
              </button>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
