import { MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { X } from "@phosphor-icons/react/X";
import { ThemedSelect } from "../ThemedSelect";

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
            id="orders-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search orders by course or order ID..."
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

        {/* Course Select */}
        <div className="flex min-h-[39px] w-[140px] items-center rounded-[9px] bg-[color-mix(in_srgb,var(--surface-strong)_72%,var(--canvas))] px-3 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_20%,transparent)] focus-within:shadow-[inset_0_0_0_1px_var(--accent),0_0_0_3px_color-mix(in_srgb,var(--accent)_16%,transparent)] transition-all">
          <ThemedSelect
            id="orders-course-filter"
            value={courseFilter}
            onValueChange={onCourseFilterChange}
            options={courseOptions}
            ariaLabel="Filter by course"
            triggerClassName="!min-h-[39px] !p-0 !bg-transparent !shadow-none !border-0 text-xs md:text-sm font-medium text-[var(--text-secondary)] hover:!bg-transparent hover:!text-[var(--text)] focus:!outline-none flex items-center justify-between w-full"
          />
        </div>

        {/* Status Select */}
        <div className="flex min-h-[39px] w-[140px] items-center rounded-[9px] bg-[color-mix(in_srgb,var(--surface-strong)_72%,var(--canvas))] px-3 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_20%,transparent)] focus-within:shadow-[inset_0_0_0_1px_var(--accent),0_0_0_3px_color-mix(in_srgb,var(--accent)_16%,transparent)] transition-all">
          <ThemedSelect
            id="orders-status-filter"
            value={statusFilter}
            onValueChange={onStatusFilterChange}
            options={statusOptions}
            ariaLabel="Filter by status"
            triggerClassName="!min-h-[39px] !p-0 !bg-transparent !shadow-none !border-0 text-xs md:text-sm font-medium text-[var(--text-secondary)] hover:!bg-transparent hover:!text-[var(--text)] focus:!outline-none flex items-center justify-between w-full"
          />
        </div>
      </div>
    </div>
  );
}
