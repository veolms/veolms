import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { XIcon as X } from "@phosphor-icons/react/X";
import { ThemedSelect } from "../ThemedSelect";
import {
  SEARCH_SHORTCUT_ARIA_KEYSHORTCUTS,
  SearchShortcutHint,
} from "../searchShortcut";

export interface OrderFiltersBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  courseFilter: string;
  onCourseFilterChange: (course: string) => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
}

const courseOptions: readonly [string, string][] = [
  ["all", "Course"],
  ["typescript-course", "TypeScript"],
  ["backend-nodejs", "Node.js"],
  ["ui-ux-design", "UI/UX Design"],
  ["postgresql-mastery", "PostgreSQL"],
  ["graphql-masterclass", "GraphQL"],
  ["javascript-course", "JavaScript"],
];

const statusOptions: readonly [string, string][] = [
  ["all", "Status"],
  ["completed", "Completed"],
  ["pending", "Pending"],
  ["failed", "Failed"],
  ["refunded", "Refunded"],
];

export function OrderFiltersBar({
  searchQuery,
  onSearchChange,
  courseFilter,
  onCourseFilterChange,
  statusFilter,
  onStatusFilterChange,
}: OrderFiltersBarProps) {
  return (
    <div
      className="flex flex-col gap-3 rounded-[15px] border border-(--border) bg-(--card-surface) p-3 md:p-3.5 transition-all"
      style={{ boxShadow: "var(--card-shadow)" }}
    >
      <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
        {/* Search Input */}
        <label className="flex min-h-9.75 min-w-52.5 flex-1 items-center gap-2.5 rounded-[9px] bg-[color-mix(in_srgb,var(--surface-strong)_72%,var(--canvas))] px-3 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_20%,transparent)] focus-within:shadow-[inset_0_0_0_1px_var(--accent),0_0_0_3px_color-mix(in_srgb,var(--accent)_16%,transparent)] transition-all cursor-text">
          <MagnifyingGlass
            size={17}
            className="text-(--muted) shrink-0"
            aria-hidden="true"
          />
          <input
            id="orders-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search orders by course or order ID..."
            aria-label="Search orders"
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

        {/* Course Select */}
        <div className="flex min-h-9.75 w-35 items-center rounded-[9px] bg-[color-mix(in_srgb,var(--surface-strong)_72%,var(--canvas))] px-3 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_20%,transparent)] focus-within:shadow-[inset_0_0_0_1px_var(--accent),0_0_0_3px_color-mix(in_srgb,var(--accent)_16%,transparent)] transition-all">
          <ThemedSelect
            id="orders-course-filter"
            value={courseFilter}
            onValueChange={onCourseFilterChange}
            options={courseOptions}
            ariaLabel="Filter by course"
            triggerClassName="min-h-9.75! p-0! bg-transparent! shadow-none! border-0! text-xs md:text-sm font-medium text-(--text-secondary) hover:bg-transparent! hover:text-(--text)! focus:outline-none! flex items-center justify-between w-full"
          />
        </div>

        {/* Status Select */}
        <div className="flex min-h-9.75 w-35 items-center rounded-[9px] bg-[color-mix(in_srgb,var(--surface-strong)_72%,var(--canvas))] px-3 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_20%,transparent)] focus-within:shadow-[inset_0_0_0_1px_var(--accent),0_0_0_3px_color-mix(in_srgb,var(--accent)_16%,transparent)] transition-all">
          <ThemedSelect
            id="orders-status-filter"
            value={statusFilter}
            onValueChange={onStatusFilterChange}
            options={statusOptions}
            ariaLabel="Filter by status"
            triggerClassName="min-h-9.75! p-0! bg-transparent! shadow-none! border-0! text-xs md:text-sm font-medium text-(--text-secondary) hover:bg-transparent! hover:text-(--text)! focus:outline-none! flex items-center justify-between w-full"
          />
        </div>
      </div>
    </div>
  );
}
