import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { XIcon as X } from "@phosphor-icons/react/X";
import { ThemedSelect } from "../ThemedSelect";
import {
  SEARCH_SHORTCUT_ARIA_KEYSHORTCUTS,
  SearchShortcutHint,
} from "../searchShortcut";

export interface NotificationFiltersBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  categoryFilter: string;
  onCategoryFilterChange: (category: string) => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  sortBy: string;
  onSortByChange: (sort: string) => void;
}

const categoryOptions: readonly [string, string][] = [
  ["all", "All categories"],
  ["transactional", "Transactions"],
  ["social", "Social"],
  ["learning", "Learning"],
  ["system", "System"],
];

const statusOptions: readonly [string, string][] = [
  ["all", "All status"],
  ["unread", "Unread only"],
  ["read", "Read only"],
];

const sortOptions: readonly [string, string][] = [
  ["latest", "Latest activity"],
  ["oldest", "Oldest first"],
  ["unread", "Unread first"],
];

export function NotificationFiltersBar({
  searchQuery,
  onSearchChange,
  categoryFilter,
  onCategoryFilterChange,
  statusFilter,
  onStatusFilterChange,
  sortBy,
  onSortByChange,
}: NotificationFiltersBarProps) {
  return (
    <div
      className="flex flex-col gap-3 rounded-[15px] border border-(--border) bg-(--card-surface) p-3 transition-all md:p-3.5"
      style={{ boxShadow: "var(--card-shadow)" }}
    >
      <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
        {/* Search Input */}
        <label className="flex min-h-9.75 min-w-52.5 flex-1 cursor-text items-center gap-2.5 rounded-[9px] bg-[color-mix(in_srgb,var(--surface-strong)_72%,var(--canvas))] px-3 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_20%,transparent)] transition-all focus-within:shadow-[inset_0_0_0_1px_var(--accent),0_0_0_3px_color-mix(in_srgb,var(--accent)_16%,transparent)]">
          <MagnifyingGlass
            size={17}
            className="text-(--muted) shrink-0"
            aria-hidden="true"
          />
          <input
            id="notifications-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search notifications..."
            aria-label="Search notifications"
            aria-keyshortcuts={SEARCH_SHORTCUT_ARIA_KEYSHORTCUTS}
            data-search-shortcut-target
            className="w-full border-0 bg-transparent p-0 text-xs md:text-sm text-(--text-secondary) placeholder-(--muted) outline-none"
          />
          <SearchShortcutHint />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              aria-label="Clear search"
              className="text-(--muted) hover:text-(--text) cursor-pointer"
            >
              <X size={14} />
            </button>
          )}
        </label>

        {/* Category Select */}
        <div className="flex min-h-9.75 min-w-36.25 items-center rounded-[9px] bg-[color-mix(in_srgb,var(--surface-strong)_72%,var(--canvas))] px-3 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_20%,transparent)] transition-all focus-within:shadow-[inset_0_0_0_1px_var(--accent),0_0_0_3px_color-mix(in_srgb,var(--accent)_16%,transparent)]">
          <ThemedSelect
            id="notifications-category-filter"
            value={categoryFilter}
            onValueChange={onCategoryFilterChange}
            options={categoryOptions}
            ariaLabel="Filter by category"
            triggerClassName="min-h-9.75! p-0! bg-transparent! shadow-none! border-0! text-xs md:text-sm font-medium text-(--text-secondary) hover:bg-transparent! hover:text-(--text)! focus:outline-none! flex items-center justify-between w-full whitespace-nowrap"
          />
        </div>

        {/* Status Select */}
        <div className="flex min-h-9.75 min-w-31.25 items-center rounded-[9px] bg-[color-mix(in_srgb,var(--surface-strong)_72%,var(--canvas))] px-3 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_20%,transparent)] transition-all focus-within:shadow-[inset_0_0_0_1px_var(--accent),0_0_0_3px_color-mix(in_srgb,var(--accent)_16%,transparent)]">
          <ThemedSelect
            id="notifications-status-filter"
            value={statusFilter}
            onValueChange={onStatusFilterChange}
            options={statusOptions}
            ariaLabel="Filter by read status"
            triggerClassName="min-h-9.75! p-0! bg-transparent! shadow-none! border-0! text-xs md:text-sm font-medium text-(--text-secondary) hover:bg-transparent! hover:text-(--text)! focus:outline-none! flex items-center justify-between w-full whitespace-nowrap"
          />
        </div>

        {/* Sort Select */}
        <div className="flex min-h-9.75 min-w-36.25 items-center rounded-[9px] bg-[color-mix(in_srgb,var(--surface-strong)_72%,var(--canvas))] px-3 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_20%,transparent)] transition-all focus-within:shadow-[inset_0_0_0_1px_var(--accent),0_0_0_3px_color-mix(in_srgb,var(--accent)_16%,transparent)]">
          <ThemedSelect
            id="notifications-sort-filter"
            value={sortBy}
            onValueChange={onSortByChange}
            options={sortOptions}
            ariaLabel="Sort notifications"
            triggerClassName="min-h-9.75! p-0! bg-transparent! shadow-none! border-0! text-xs md:text-sm font-medium text-(--text-secondary) hover:bg-transparent! hover:text-(--text)! focus:outline-none! flex items-center justify-between w-full whitespace-nowrap"
          />
        </div>
      </div>
    </div>
  );
}
