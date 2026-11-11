import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { XIcon as X } from "@phosphor-icons/react/X";

import {
  FilterBar,
  filterButtonSizeClasses,
  filterControlClasses,
  filterSelectTriggerClasses,
} from "../../components/FilterBar";
import { ThemedSelect } from "../../ThemedSelect";
import {
  hasActiveLinkFilters,
  type LinkFilters,
  type LinkSort,
  type LinkStatusFilter,
  type LinkTypeFilter,
} from "./linkFilters";

const typeOptions = [
  ["all", "All types"],
  ["redirect", "Redirects"],
  ["rewrite", "Shown here"],
] as const;

const statusOptions = [
  ["all", "All statuses"],
  ["active", "Active"],
  ["paused", "Paused"],
] as const;

const sortOptions = [
  ["newest", "Newest first"],
  ["visits", "Most visits"],
  ["recent-visit", "Recently visited"],
  ["path", "Address (A-Z)"],
] as const;

/** Search and filters above the links table, as the Students page has. */
export function LinkFiltersBar({
  filters,
  onChange,
}: {
  filters: LinkFilters;
  onChange: (filters: LinkFilters) => void;
}) {
  const set = <Key extends keyof LinkFilters>(
    key: Key,
    value: LinkFilters[Key],
  ) => onChange({ ...filters, [key]: value });

  return (
    <FilterBar className="gap-3">
      <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
        <label
          className={`${filterControlClasses} min-w-56 flex-1 basis-full cursor-text gap-2.5 sm:basis-0`}
        >
          <MagnifyingGlass
            size={17}
            className="shrink-0 text-(--muted)"
            aria-hidden="true"
          />
          <input
            id="links-search-input"
            type="text"
            value={filters.search}
            onChange={(event) => set("search", event.target.value)}
            placeholder="Search by address, destination or creator..."
            aria-label="Search links"
            className="w-full border-0 bg-transparent p-0 text-xs text-(--text-secondary) placeholder-(--muted) outline-none md:text-sm"
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => set("search", "")}
              aria-label="Clear search"
              className="cursor-pointer text-(--muted) hover:text-(--text)"
            >
              <X size={14} />
            </button>
          )}
        </label>

        <div className={`${filterControlClasses} min-w-36`}>
          <ThemedSelect
            id="links-type-filter"
            value={filters.type}
            onValueChange={(value) => set("type", value as LinkTypeFilter)}
            options={typeOptions}
            ariaLabel="Filter by type"
            triggerClassName={`${filterSelectTriggerClasses} w-full`}
          />
        </div>

        <div className={`${filterControlClasses} min-w-36`}>
          <ThemedSelect
            id="links-status-filter"
            value={filters.status}
            onValueChange={(value) => set("status", value as LinkStatusFilter)}
            options={statusOptions}
            ariaLabel="Filter by status"
            triggerClassName={`${filterSelectTriggerClasses} w-full`}
          />
        </div>

        <div className={`${filterControlClasses} min-w-40`}>
          <ThemedSelect
            id="links-sort"
            value={filters.sort}
            onValueChange={(value) => set("sort", value as LinkSort)}
            options={sortOptions}
            ariaLabel="Sort links"
            triggerClassName={`${filterSelectTriggerClasses} w-full`}
          />
        </div>

        {hasActiveLinkFilters(filters) && (
          <button
            type="button"
            onClick={() =>
              onChange({
                search: "",
                type: "all",
                status: "all",
                sort: "newest",
              })
            }
            className={`${filterButtonSizeClasses} flex cursor-pointer items-center gap-1.5 border border-(--border) bg-(--card-surface) px-3 py-1.5 text-xs font-medium text-(--muted) transition-colors hover:bg-(--hover) hover:text-(--text)`}
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
