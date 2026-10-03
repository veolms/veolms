import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { XIcon as X } from "@phosphor-icons/react/X";
import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { ThemedSelect } from "../ThemedSelect";
import { SEARCH_SHORTCUT_ARIA_KEYSHORTCUTS, SearchShortcutHint } from "../searchShortcut";

export interface StudentFiltersBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  courseFilter: string;
  onCourseFilterChange: (course: string) => void;
  statusFilter: "all" | "active" | "completed" | "inactive";
  onStatusFilterChange: (status: "all" | "active" | "completed" | "inactive") => void;
  sortBy: "recent" | "name" | "courses" | "progress";
  onSortByChange: (sort: "recent" | "name" | "courses" | "progress") => void;
  availableCourses: readonly { id: string; title: string }[];
  onCourseFilterOpen: () => void;
  onCourseFilterClose: () => void;
  onResetFilters: () => void;
}

const statusOptions: readonly [string, string][] = [
  ["all", "All Statuses"],
  ["active", "Active Learners"],
  ["completed", "Completed Course"],
  ["inactive", "Inactive"],
];

const sortOptions: readonly [string, string][] = [
  ["recent", "Recently Joined"],
  ["name", "Name (A-Z)"],
  ["courses", "Most Courses"],
  ["progress", "Highest Progress"],
];

export function StudentFiltersBar({
  searchQuery,
  onSearchChange,
  courseFilter,
  onCourseFilterChange,
  statusFilter,
  onStatusFilterChange,
  sortBy,
  onSortByChange,
  availableCourses,
  onCourseFilterOpen,
  onCourseFilterClose,
  onResetFilters,
}: StudentFiltersBarProps) {
  const courseOptions: readonly [string, string][] = [
    ["all", "All Courses"],
    ...availableCourses.map((c) => [c.id, c.title] as [string, string]),
  ];

  const hasActiveFilters =
    Boolean(searchQuery) || courseFilter !== "all" || statusFilter !== "all" || sortBy !== "recent";

  return (
    <div
      className="flex flex-col gap-3 rounded-[15px] border border-(--border) bg-(--card-surface) p-3 transition-all md:p-3.5"
      style={{ boxShadow: "var(--card-shadow)" }}
    >
      <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
        {/* Search Input */}
        <label className="flex min-h-9.75 min-w-56 flex-1 cursor-text items-center gap-2.5 rounded-[9px] bg-[color-mix(in_srgb,var(--surface-strong)_72%,var(--canvas))] px-3 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_20%,transparent)] transition-all focus-within:shadow-[inset_0_0_0_1px_var(--accent),0_0_0_3px_color-mix(in_srgb,var(--accent)_16%,transparent)]">
          <MagnifyingGlass size={17} className="shrink-0 text-(--muted)" aria-hidden="true" />
          <input
            id="students-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search students by name, @username, or email..."
            aria-label="Search students"
            aria-keyshortcuts={SEARCH_SHORTCUT_ARIA_KEYSHORTCUTS}
            data-search-shortcut-target
            className="w-full border-0 bg-transparent p-0 text-xs text-(--text-secondary) placeholder-(--muted) outline-none md:text-sm"
          />
          <SearchShortcutHint />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              aria-label="Clear search"
              className="cursor-pointer text-(--muted) hover:text-(--text)"
            >
              <X size={14} />
            </button>
          )}
        </label>

        {/* Course Filter Dropdown */}
        <div className="flex min-h-9.75 min-w-40 items-center rounded-[9px] bg-[color-mix(in_srgb,var(--surface-strong)_72%,var(--canvas))] px-3 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_20%,transparent)] transition-all focus-within:shadow-[inset_0_0_0_1px_var(--accent),0_0_0_3px_color-mix(in_srgb,var(--accent)_16%,transparent)]">
          <ThemedSelect
            id="students-course-filter"
            value={courseFilter}
            onValueChange={onCourseFilterChange}
            options={courseOptions}
            searchable
            onOpen={onCourseFilterOpen}
            onClose={onCourseFilterClose}
            searchPlaceholder="Search courses..."
            defaultLimit={8}
            ariaLabel="Filter by course"
            triggerClassName="min-h-9.75! p-0! bg-transparent! shadow-none! border-0! text-xs md:text-sm font-medium text-(--text-secondary) hover:bg-transparent! hover:text-(--text)! focus:outline-none! flex items-center justify-between w-full"
          />
        </div>

        {/* Status Filter Dropdown */}
        <div className="flex min-h-9.75 min-w-36 items-center rounded-[9px] bg-[color-mix(in_srgb,var(--surface-strong)_72%,var(--canvas))] px-3 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_20%,transparent)] transition-all focus-within:shadow-[inset_0_0_0_1px_var(--accent),0_0_0_3px_color-mix(in_srgb,var(--accent)_16%,transparent)]">
          <ThemedSelect
            id="students-status-filter"
            value={statusFilter}
            onValueChange={(val) =>
              onStatusFilterChange(val as "all" | "active" | "completed" | "inactive")
            }
            options={statusOptions}
            ariaLabel="Filter by status"
            triggerClassName="min-h-9.75! p-0! bg-transparent! shadow-none! border-0! text-xs md:text-sm font-medium text-(--text-secondary) hover:bg-transparent! hover:text-(--text)! focus:outline-none! flex items-center justify-between w-full"
          />
        </div>

        {/* Sort Dropdown */}
        <div className="flex min-h-9.75 min-w-38 items-center rounded-[9px] bg-[color-mix(in_srgb,var(--surface-strong)_72%,var(--canvas))] px-3 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_20%,transparent)] transition-all focus-within:shadow-[inset_0_0_0_1px_var(--accent),0_0_0_3px_color-mix(in_srgb,var(--accent)_16%,transparent)]">
          <ThemedSelect
            id="students-sort-filter"
            value={sortBy}
            onValueChange={(val) =>
              onSortByChange(val as "recent" | "name" | "courses" | "progress")
            }
            options={sortOptions}
            ariaLabel="Sort students"
            triggerClassName="min-h-9.75! p-0! bg-transparent! shadow-none! border-0! text-xs md:text-sm font-medium text-(--text-secondary) hover:bg-transparent! hover:text-(--text)! focus:outline-none! flex items-center justify-between w-full"
          />
        </div>

        {/* Reset Filters button */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={onResetFilters}
            className="flex min-h-9.75 cursor-pointer items-center gap-1.5 rounded-[9px] border border-(--border) bg-(--card-surface) px-3 py-1.5 text-xs font-medium text-(--muted) transition-colors hover:bg-(--hover) hover:text-(--text)"
            title="Reset all filters"
          >
            <ArrowCounterClockwise size={14} />
            <span>Reset</span>
          </button>
        )}
      </div>
    </div>
  );
}
