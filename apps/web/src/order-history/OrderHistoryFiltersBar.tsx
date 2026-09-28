import { useState } from "react";
import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { FunnelIcon as Funnel } from "@phosphor-icons/react/Funnel";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { XIcon as X } from "@phosphor-icons/react/X";
import { ThemedSelect } from "../ThemedSelect";
import {
  SEARCH_SHORTCUT_ARIA_KEYSHORTCUTS,
  SearchShortcutHint,
} from "../searchShortcut";

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
      className="flex flex-col gap-2.5 sm:gap-3 rounded-[15px] border border-(--border) bg-(--card-surface) p-2.5 sm:p-3.5 transition-all w-full"
      style={{ boxShadow: "var(--card-shadow)" }}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2.5">
        {/* Search Input */}
        <label className="flex min-h-9.75 w-full sm:min-w-56 sm:flex-1 items-center gap-2.5 rounded-[9px] bg-[color-mix(in_srgb,var(--surface-strong)_72%,var(--canvas))] px-3 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_20%,transparent)] focus-within:shadow-[inset_0_0_0_1px_var(--accent),0_0_0_3px_color-mix(in_srgb,var(--accent)_16%,transparent)] transition-all cursor-text">
          <MagnifyingGlass
            size={17}
            className="text-(--muted) shrink-0"
            aria-hidden="true"
          />
          <input
            id="order-history-search-input"
            type="search"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
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
              onClick={() => onSearchChange("")}
              aria-label="Clear order search"
              className="text-(--muted) hover:text-(--text) cursor-pointer shrink-0"
            >
              <X size={15} />
            </button>
          )}
        </label>

        {/* Filters Button & Reset */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            aria-label="Toggle order filters"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((open) => !open)}
            className={`inline-flex min-h-9.75 shrink-0 items-center gap-2 rounded-[9px] border px-3 text-xs md:text-sm font-medium transition-colors cursor-pointer ${
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
              className="flex min-h-9.75 items-center gap-1.5 rounded-[9px] bg-(--hover) px-3 py-1.5 text-xs md:text-sm font-medium text-(--muted) hover:bg-(--surface-strong) hover:text-(--text) transition-colors cursor-pointer"
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
