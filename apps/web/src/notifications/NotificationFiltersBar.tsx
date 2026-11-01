import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { XIcon as X } from "@phosphor-icons/react/X";
import { ThemedSelect } from "../ThemedSelect";
import {
  SEARCH_SHORTCUT_ARIA_KEYSHORTCUTS,
  SearchShortcutHint,
} from "../searchShortcut";

import {
  FilterBar,
  filterControlClasses,
  filterSelectTriggerClasses,
} from "../components/FilterBar";
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
    <FilterBar className="gap-3">
      <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
        {/* Search Input */}
        <label
          className={`${filterControlClasses} min-w-52.5 flex-1 cursor-text gap-2.5`}
        >
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
        <div className={`${filterControlClasses} min-w-36.25`}>
          <ThemedSelect
            id="notifications-category-filter"
            value={categoryFilter}
            onValueChange={onCategoryFilterChange}
            options={categoryOptions}
            ariaLabel="Filter by category"
            triggerClassName={`${filterSelectTriggerClasses} w-full whitespace-nowrap`}
          />
        </div>

        {/* Status Select */}
        <div className={`${filterControlClasses} min-w-31.25`}>
          <ThemedSelect
            id="notifications-status-filter"
            value={statusFilter}
            onValueChange={onStatusFilterChange}
            options={statusOptions}
            ariaLabel="Filter by read status"
            triggerClassName={`${filterSelectTriggerClasses} w-full whitespace-nowrap`}
          />
        </div>

        {/* Sort Select */}
        <div className={`${filterControlClasses} min-w-36.25`}>
          <ThemedSelect
            id="notifications-sort-filter"
            value={sortBy}
            onValueChange={onSortByChange}
            options={sortOptions}
            ariaLabel="Sort notifications"
            triggerClassName={`${filterSelectTriggerClasses} w-full whitespace-nowrap`}
          />
        </div>
      </div>
    </FilterBar>
  );
}
