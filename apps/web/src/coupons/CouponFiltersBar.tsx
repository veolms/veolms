import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { XIcon as X } from "@phosphor-icons/react/X";
import { ThemedSelect } from "../ThemedSelect";
import { SEARCH_SHORTCUT_ARIA_KEYSHORTCUTS, SearchShortcutHint } from "../searchShortcut";
import { inputClass, type CouponSortOption, type CouponTabFilter } from "./couponHelpers";

export interface CouponFiltersBarProps {
  activeTab: CouponTabFilter;
  onTabChange: (tab: CouponTabFilter) => void;
  counts: {
    all: number;
    active: number;
    scheduled: number;
    expired: number;
    draft: number;
  };
  searchQuery: string;
  onSearchChange: (query: string) => void;
  sortBy: CouponSortOption;
  onSortChange: (sort: CouponSortOption) => void;
  discountTypeFilter: "all" | "percentage" | "fixed";
  onDiscountTypeFilterChange: (type: "all" | "percentage" | "fixed") => void;
}

const sortOptions: readonly [CouponSortOption, string][] = [
  ["newest", "Newest"],
  ["oldest", "Oldest"],
  ["discount_high", "Highest discount"],
  ["expiring_soon", "Expiring soon"],
];

const discountTypeOptions: readonly ["all" | "percentage" | "fixed", string][] = [
  ["all", "All types"],
  ["percentage", "Percentage"],
  ["fixed", "Fixed amount"],
];

export function CouponFiltersBar({
  activeTab,
  onTabChange,
  counts,
  searchQuery,
  onSearchChange,
  sortBy,
  onSortChange,
  discountTypeFilter,
  onDiscountTypeFilterChange,
}: CouponFiltersBarProps) {
  const tabs: { id: CouponTabFilter; label: string; count: number }[] = [
    { id: "all", label: "All", count: counts.all },
    { id: "active", label: "Active", count: counts.active },
    { id: "scheduled", label: "Scheduled", count: counts.scheduled },
    { id: "expired", label: "Expired", count: counts.expired },
    { id: "draft", label: "Inactive", count: counts.draft },
  ];

  return (
    <div className="mt-4 flex flex-col gap-3 px-3 pb-3 sm:px-7 sm:pb-5">
      <div
        className="no-scrollbar flex items-center gap-1 overflow-x-auto rounded-[10px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_80%,var(--surface))] p-1 shadow-[inset_0_1px_2px_color-mix(in_srgb,black_10%,transparent)] sm:rounded-[12px]"
        role="tablist"
        aria-label="Coupon status"
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onTabChange(tab.id)}
              className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all sm:rounded-[8px] ${
                isActive
                  ? "bg-(--card-surface,var(--surface)) text-(--text) shadow-(--card-compact-shadow)"
                  : "text-(--muted) hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:text-(--text)"
              }`}
            >
              <span>{tab.label}</span>
              <span className="text-[0.68rem] opacity-70">{tab.count}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <label
          className={`${inputClass} flex min-h-10 min-w-0 flex-1 cursor-text items-center gap-2.5`}
        >
          <MagnifyingGlass size={16} className="shrink-0 text-(--muted)" aria-hidden="true" />
          <input
            id="coupons-search-input"
            type="text"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search by code or description"
            aria-label="Search coupons"
            aria-keyshortcuts={SEARCH_SHORTCUT_ARIA_KEYSHORTCUTS}
            data-search-shortcut-target
            className="w-full border-0 bg-transparent p-0 text-xs text-(--text) outline-none placeholder:text-(--muted) sm:text-sm"
          />
          <SearchShortcutHint />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              aria-label="Clear search"
              className="cursor-pointer text-(--muted) hover:text-(--text)"
            >
              <X size={14} />
            </button>
          ) : null}
        </label>

        <div className={`${inputClass} flex min-h-10 w-full items-center sm:w-44`}>
          <ThemedSelect
            id="coupons-type-filter"
            value={discountTypeFilter}
            onValueChange={(value) =>
              onDiscountTypeFilterChange(value as "all" | "percentage" | "fixed")
            }
            options={discountTypeOptions}
            ariaLabel="Filter by discount type"
            triggerClassName="h-10! p-0! bg-transparent! shadow-none! border-0! text-xs font-semibold text-(--text) hover:bg-transparent! focus:outline-none! flex w-full items-center justify-between"
          />
        </div>

        <div className={`${inputClass} flex min-h-10 w-full items-center sm:w-40`}>
          <ThemedSelect
            id="coupons-sort-filter"
            value={sortBy}
            onValueChange={(value) => onSortChange(value as CouponSortOption)}
            options={sortOptions}
            ariaLabel="Sort coupons"
            triggerClassName="h-10! p-0! bg-transparent! shadow-none! border-0! text-xs font-semibold text-(--text) hover:bg-transparent! focus:outline-none! flex w-full items-center justify-between"
          />
        </div>
      </div>
    </div>
  );
}
