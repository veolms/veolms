import { useState } from "react";
import { CalendarBlank } from "@phosphor-icons/react/CalendarBlank";
import { Funnel } from "@phosphor-icons/react/Funnel";
import { MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { X } from "@phosphor-icons/react/X";
import { ThemedSelect } from "../ThemedSelect";

export interface OrderHistoryFiltersBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  dateRangeFilter: string;
  onDateRangeFilterChange: (range: string) => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  paymentMethodFilter: string;
  onPaymentMethodFilterChange: (method: string) => void;
}

const dateRangeOptions: readonly [string, string][] = [
  ["all", "Date range"],
  ["30d", "Last 30 days"],
  ["3m", "Last 3 months"],
  ["6m", "Last 6 months"],
  ["2025", "Year 2025"],
  ["2024", "Year 2024"],
];

const statusOptions: readonly [string, string][] = [
  ["all", "Status"],
  ["completed", "Completed"],
  ["processing", "Processing"],
  ["refunded", "Refunded"],
  ["failed", "Failed"],
  ["canceled", "Canceled"],
];

const paymentMethodOptions: readonly [string, string][] = [
  ["all", "Payment method"],
  ["visa", "Visa •••• 4242"],
  ["mastercard", "Mastercard •••• 1234"],
  ["upi", "UPI"],
  ["paypal", "PayPal"],
];

export function OrderHistoryFiltersBar({
  searchQuery,
  onSearchChange,
  dateRangeFilter,
  onDateRangeFilterChange,
  statusFilter,
  onStatusFilterChange,
  paymentMethodFilter,
  onPaymentMethodFilterChange,
}: OrderHistoryFiltersBarProps) {
  const [extraFiltersOpen, setExtraFiltersOpen] = useState(false);

  return (
    <div
      className="flex flex-col gap-3 rounded-[15px] border border-[var(--border)] bg-[var(--card-surface)] p-3 md:p-3.5 transition-all"
      style={{ boxShadow: "var(--card-shadow)" }}
    >
      <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
        {/* Search Input */}
        <label className="flex min-h-[39px] min-w-[210px] flex-1 items-center gap-2.5 rounded-[9px] bg-[color-mix(in_srgb,var(--surface-strong)_72%,var(--canvas))] px-3 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_20%,transparent)] focus-within:shadow-[inset_0_0_0_1px_var(--accent),0_0_0_3px_color-mix(in_srgb,var(--accent)_16%,transparent)] transition-all cursor-text">
          <MagnifyingGlass
            size={17}
            className="text-[var(--muted)] flex-shrink-0"
            aria-hidden="true"
          />
          <input
            id="order-history-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by order ID, course, or invoice..."
            aria-label="Search orders"
            className="w-full border-0 bg-transparent p-0 text-xs md:text-sm text-[var(--text-secondary)] placeholder-[var(--muted)] outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              aria-label="Clear search"
              className="text-[var(--muted)] hover:text-[var(--text)] cursor-pointer"
            >
              <X size={14} />
            </button>
          )}
        </label>

        {/* Date Range Select - single line whitespace-nowrap */}
        <div className="flex min-h-[39px] min-w-[150px] items-center gap-2 rounded-[9px] bg-[color-mix(in_srgb,var(--surface-strong)_72%,var(--canvas))] px-3 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_20%,transparent)] focus-within:shadow-[inset_0_0_0_1px_var(--accent),0_0_0_3px_color-mix(in_srgb,var(--accent)_16%,transparent)] transition-all flex-shrink-0">
          <CalendarBlank size={16} className="text-[var(--muted)] flex-shrink-0" />
          <ThemedSelect
            id="order-history-date-filter"
            value={dateRangeFilter}
            onValueChange={onDateRangeFilterChange}
            options={dateRangeOptions}
            ariaLabel="Filter by date range"
            triggerClassName="!min-h-[39px] !p-0 !bg-transparent !shadow-none !border-0 text-xs md:text-sm font-medium text-[var(--text-secondary)] hover:!bg-transparent hover:!text-[var(--text)] focus:!outline-none flex items-center justify-between w-full whitespace-nowrap"
          />
        </div>

        {/* Status Select - single line whitespace-nowrap */}
        <div className="flex min-h-[39px] min-w-[130px] items-center rounded-[9px] bg-[color-mix(in_srgb,var(--surface-strong)_72%,var(--canvas))] px-3 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_20%,transparent)] focus-within:shadow-[inset_0_0_0_1px_var(--accent),0_0_0_3px_color-mix(in_srgb,var(--accent)_16%,transparent)] transition-all flex-shrink-0">
          <ThemedSelect
            id="order-history-status-filter"
            value={statusFilter}
            onValueChange={onStatusFilterChange}
            options={statusOptions}
            ariaLabel="Filter by status"
            triggerClassName="!min-h-[39px] !p-0 !bg-transparent !shadow-none !border-0 text-xs md:text-sm font-medium text-[var(--text-secondary)] hover:!bg-transparent hover:!text-[var(--text)] focus:!outline-none flex items-center justify-between w-full whitespace-nowrap"
          />
        </div>

        {/* Payment Method Select - single line whitespace-nowrap */}
        <div className="flex min-h-[39px] min-w-[175px] items-center rounded-[9px] bg-[color-mix(in_srgb,var(--surface-strong)_72%,var(--canvas))] px-3 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_20%,transparent)] focus-within:shadow-[inset_0_0_0_1px_var(--accent),0_0_0_3px_color-mix(in_srgb,var(--accent)_16%,transparent)] transition-all flex-shrink-0">
          <ThemedSelect
            id="order-history-payment-filter"
            value={paymentMethodFilter}
            onValueChange={onPaymentMethodFilterChange}
            options={paymentMethodOptions}
            ariaLabel="Filter by payment method"
            triggerClassName="!min-h-[39px] !p-0 !bg-transparent !shadow-none !border-0 text-xs md:text-sm font-medium text-[var(--text-secondary)] hover:!bg-transparent hover:!text-[var(--text)] focus:!outline-none flex items-center justify-between w-full whitespace-nowrap"
          />
        </div>

        {/* Filters Quick Button */}
        <button
          type="button"
          onClick={() => setExtraFiltersOpen((prev) => !prev)}
          aria-label="Toggle filters"
          aria-expanded={extraFiltersOpen}
          className="flex min-h-[39px] items-center gap-1.5 rounded-[9px] bg-[color-mix(in_srgb,var(--surface-strong)_72%,var(--canvas))] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_20%,transparent)] px-3.5 text-xs md:text-sm font-medium text-[var(--text)] transition-all hover:bg-[var(--hover)] cursor-pointer flex-shrink-0 whitespace-nowrap"
        >
          <Funnel size={15} />
          <span>Filters</span>
        </button>
      </div>

      {/* Expandable Extra Filters Drawer if toggled */}
      {extraFiltersOpen && (
        <div className="flex flex-wrap items-center gap-2 rounded-[10px] bg-[color-mix(in_srgb,var(--surface-strong)_79%,var(--canvas))] p-2.5 text-xs text-[var(--text-secondary)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text)_7%,transparent)] animate-in fade-in slide-in-from-top-1 duration-150">
          <span className="font-semibold text-[var(--text)]">Quick status:</span>
          <button
            type="button"
            onClick={() => onStatusFilterChange("completed")}
            className="rounded-lg bg-[var(--hover)] px-2.5 py-1 text-xs hover:text-[var(--text)] cursor-pointer"
          >
            ✓ Completed
          </button>
          <button
            type="button"
            onClick={() => onStatusFilterChange("processing")}
            className="rounded-lg bg-[var(--hover)] px-2.5 py-1 text-xs hover:text-[var(--text)] cursor-pointer"
          >
            ⏱ Processing
          </button>
          <button
            type="button"
            onClick={() => onStatusFilterChange("refunded")}
            className="rounded-lg bg-[var(--hover)] px-2.5 py-1 text-xs hover:text-[var(--text)] cursor-pointer"
          >
            ↺ Refunded
          </button>
        </div>
      )}
    </div>
  );
}
