import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { XIcon as X } from "@phosphor-icons/react/X";
import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { ThemedSelect } from "../ThemedSelect";
import {
  SEARCH_SHORTCUT_ARIA_KEYSHORTCUTS,
  SearchShortcutHint,
} from "../searchShortcut";

import {
  FilterBar,
  filterButtonSizeClasses,
  filterControlClasses,
  filterSelectTriggerClasses,
} from "../components/FilterBar";
export interface StudentFiltersBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  courseFilter: string;
  onCourseFilterChange: (course: string) => void;
  statusFilter: "all" | "active" | "completed" | "inactive";
  onStatusFilterChange: (
    status: "all" | "active" | "completed" | "inactive",
  ) => void;
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
    Boolean(searchQuery) ||
    courseFilter !== "all" ||
    statusFilter !== "all" ||
    sortBy !== "recent";

  return (
    <FilterBar className="gap-3">
      <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
        {/* Search Input */}
        <label
          className={`${filterControlClasses} min-w-56 flex-1 gap-2.5 cursor-text`}
        >
          <MagnifyingGlass
            size={17}
            className="text-(--muted) shrink-0"
            aria-hidden="true"
          />
          <input
            id="students-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by name, @username, email or phone..."
            aria-label="Search students"
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

        {/* Course Filter Dropdown */}
        <div className={`${filterControlClasses} min-w-40`}>
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
            triggerClassName={`${filterSelectTriggerClasses} w-full`}
          />
        </div>

        {/* Status Filter Dropdown */}
        <div className={`${filterControlClasses} min-w-36`}>
          <ThemedSelect
            id="students-status-filter"
            value={statusFilter}
            onValueChange={(val) =>
              onStatusFilterChange(
                val as "all" | "active" | "completed" | "inactive",
              )
            }
            options={statusOptions}
            ariaLabel="Filter by status"
            triggerClassName={`${filterSelectTriggerClasses} w-full`}
          />
        </div>

        {/* Sort Dropdown */}
        <div className={`${filterControlClasses} min-w-38`}>
          <ThemedSelect
            id="students-sort-filter"
            value={sortBy}
            onValueChange={(val) =>
              onSortByChange(val as "recent" | "name" | "courses" | "progress")
            }
            options={sortOptions}
            ariaLabel="Sort students"
            triggerClassName={`${filterSelectTriggerClasses} w-full`}
          />
        </div>

        {/* Reset Filters button */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={onResetFilters}
            className={`${filterButtonSizeClasses} flex items-center gap-1.5 border border-(--border) bg-(--card-surface) px-3 py-1.5 text-xs font-medium text-(--muted) hover:bg-(--hover) hover:text-(--text) transition-colors cursor-pointer`}
            title="Reset all filters"
          >
            <ArrowCounterClockwise size={14} />
            <span>Reset</span>
          </button>
        )}
      </div>
    </FilterBar>
  );
}
