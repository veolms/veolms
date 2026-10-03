import { useState } from "react";
import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { FunnelIcon as Funnel } from "@phosphor-icons/react/Funnel";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { XIcon as X } from "@phosphor-icons/react/X";
import { ThemedSelect } from "../ThemedSelect";
import { SEARCH_SHORTCUT_ARIA_KEYSHORTCUTS, SearchShortcutHint } from "../searchShortcut";

export interface OrderHistoryFiltersBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  dateRangeFilter: string;
  onDateRangeFilterChange: (range: string) => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  paymentMethodFilter: string;
  onPaymentMethodFilterChange: (method: string) => void;
  isFiltered?: boolean;
  onResetFilters?: () => void;
}

const dateRangeOptions: readonly [string, string][] = [
  ["all", "All dates"],
  ["30d", "Last 30 days"],
  ["3m", "Last 3 months"],
  ["6m", "Last 6 months"],
  ["2025", "Year 2025"],
  ["2024", "Year 2024"],
];

const statusOptions: readonly [string, string][] = [
  ["all", "All statuses"],
  ["completed", "Completed"],
  ["processing", "Processing"],
  ["refunded", "Refunded"],
  ["failed", "Failed"],
  ["canceled", "Canceled"],
];

const paymentMethodOptions: readonly [string, string][] = [
  ["all", "All payment methods"],
  ["visa", "Visa"],
  ["mastercard", "Mastercard"],
  ["upi", "UPI"],
  ["paypal", "PayPal"],
  ["other", "Other"],
];

const selectBoxContainerClass =
  "flex min-h-9.75 items-center rounded-[9px] bg-[color-mix(in_srgb,var(--surface-strong)_72%,var(--canvas))] px-3 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_20%,transparent)] focus-within:shadow-[inset_0_0_0_1px_var(--accent),0_0_0_3px_color-mix(in_srgb,var(--accent)_16%,transparent)] transition-all";

const selectTriggerClass =
  "min-h-9.75! p-0! bg-transparent! shadow-none! border-0! text-xs md:text-sm font-medium text-(--text-secondary) hover:bg-transparent! hover:text-(--text)! focus:outline-none! flex items-center justify-between w-full";

export function OrderHistoryFiltersBar({
  searchQuery,
  onSearchChange,
  dateRangeFilter,
  onDateRangeFilterChange,
  statusFilter,
  onStatusFilterChange,
  paymentMethodFilter,
  onPaymentMethodFilterChange,
  isFiltered = false,
  onResetFilters,
}: OrderHistoryFiltersBarProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);

  const activeFilterCount =
    (dateRangeFilter !== "all" ? 1 : 0) +
    (statusFilter !== "all" ? 1 : 0) +
    (paymentMethodFilter !== "all" ? 1 : 0);

  return (
    <div
      className="flex w-full flex-col gap-2.5 rounded-[15px] border border-(--border) bg-(--card-surface) p-2.5 transition-all sm:gap-3 sm:p-3.5"
      style={{ boxShadow: "var(--card-shadow)" }}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2.5">
        {/* Search Input */}
        <label className="flex min-h-9.75 w-full cursor-text items-center gap-2.5 rounded-[9px] bg-[color-mix(in_srgb,var(--surface-strong)_72%,var(--canvas))] px-3 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_20%,transparent)] transition-all focus-within:shadow-[inset_0_0_0_1px_var(--accent),0_0_0_3px_color-mix(in_srgb,var(--accent)_16%,transparent)] sm:min-w-56 sm:flex-1">
          <MagnifyingGlass size={17} className="shrink-0 text-(--muted)" aria-hidden="true" />
          <input
            id="order-history-search-input"
            type="search"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search your orders, courses, or invoices..."
            aria-label="Search your orders, courses, or invoices"
            aria-keyshortcuts={SEARCH_SHORTCUT_ARIA_KEYSHORTCUTS}
            data-search-shortcut-target
            className="w-full border-0 bg-transparent p-0 text-xs text-(--text-secondary) placeholder-(--muted) outline-none md:text-sm"
          />
          <SearchShortcutHint />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              aria-label="Clear order search"
              className="shrink-0 cursor-pointer text-(--muted) hover:text-(--text)"
            >
              <X size={15} />
            </button>
          )}
        </label>

        {/* Filters Button & Reset */}
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            aria-label="Toggle order filters"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((open) => !open)}
            className={`inline-flex min-h-9.75 shrink-0 cursor-pointer items-center gap-2 rounded-[9px] border px-3 text-xs font-medium transition-colors md:text-sm ${
              filtersOpen || activeFilterCount > 0
                ? "border-(--accent) bg-[color-mix(in_srgb,var(--accent)_10%,var(--card-surface))] text-(--accent)"
                : "border-(--border) bg-[color-mix(in_srgb,var(--surface-strong)_72%,var(--canvas))] text-(--muted) hover:bg-(--hover) hover:text-(--text)"
            }`}
          >
            <Funnel size={16} />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-(--accent) px-1.5 text-[10px] font-bold text-(--on-accent,#ffffff)">
                {activeFilterCount}
              </span>
            )}
          </button>

          {isFiltered && onResetFilters && (
            <button
              type="button"
              onClick={onResetFilters}
              className="flex min-h-9.75 cursor-pointer items-center gap-1.5 rounded-[9px] bg-(--hover) px-3 py-1.5 text-xs font-medium text-(--muted) transition-colors hover:bg-(--surface-strong) hover:text-(--text) md:text-sm"
            >
              <ArrowCounterClockwise size={14} />
              <span className="hidden sm:inline">Reset</span>
            </button>
          )}
        </div>
      </div>

      {filtersOpen && (
        <div className="mt-1 grid grid-cols-1 gap-2.5 rounded-[12px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--surface-strong)_30%,var(--canvas))] p-2.5 sm:grid-cols-3">
          <div className={selectBoxContainerClass}>
            <ThemedSelect
              id="order-history-date-filter"
              value={dateRangeFilter}
              onValueChange={onDateRangeFilterChange}
              options={dateRangeOptions}
              ariaLabel="Filter by date range"
              triggerClassName={selectTriggerClass}
            />
          </div>
          <div className={selectBoxContainerClass}>
            <ThemedSelect
              id="order-history-status-filter"
              value={statusFilter}
              onValueChange={onStatusFilterChange}
              options={statusOptions}
              ariaLabel="Filter by order status"
              triggerClassName={selectTriggerClass}
            />
          </div>
          <div className={selectBoxContainerClass}>
            <ThemedSelect
              id="order-history-payment-filter"
              value={paymentMethodFilter}
              onValueChange={onPaymentMethodFilterChange}
              options={paymentMethodOptions}
              ariaLabel="Filter by payment method"
              triggerClassName={selectTriggerClass}
            />
          </div>
        </div>
      )}
    </div>
  );
}
