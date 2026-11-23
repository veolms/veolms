import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { XIcon as X } from "@phosphor-icons/react/X";
import type {
  StorageLearnerFilter,
  StorageLearnerSort,
} from "@veolms/contracts";

import {
  FilterBar,
  filterButtonSizeClasses,
  filterControlClasses,
  filterSelectTriggerClasses,
} from "../../components/FilterBar";
import {
  SEARCH_SHORTCUT_ARIA_KEYSHORTCUTS,
  SearchShortcutHint,
} from "../../searchShortcut";
import { ThemedSelect } from "../../ThemedSelect";
import {
  DEFAULT_STUDENT_STORAGE_VIEW,
  filterOptions,
  sortOptions,
  type StudentStorageView,
} from "./studentStorageView";

/** Search, filter and sort above the students' storage table. */
export function StudentStorageFilters({
  view,
  onChange,
}: {
  view: StudentStorageView;
  onChange: (view: StudentStorageView) => void;
}) {
  // Any change but the page starts again from the first page.
  const set = <Key extends Exclude<keyof StudentStorageView, "page">>(
    key: Key,
    value: StudentStorageView[Key],
  ) => onChange({ ...view, [key]: value, page: 1 });
  const changed =
    view.search !== "" ||
    view.filter !== DEFAULT_STUDENT_STORAGE_VIEW.filter ||
    view.sort !== DEFAULT_STUDENT_STORAGE_VIEW.sort;

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
            id="student-storage-search"
            type="text"
            value={view.search}
            onChange={(event) => set("search", event.target.value)}
            placeholder="Search by name, username or email..."
            aria-label="Search students"
            aria-keyshortcuts={SEARCH_SHORTCUT_ARIA_KEYSHORTCUTS}
            data-search-shortcut-target
            className="w-full border-0 bg-transparent p-0 text-xs text-(--text-secondary) placeholder-(--muted) outline-none md:text-sm"
          />
          <SearchShortcutHint />
          {view.search && (
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

        <div className={`${filterControlClasses} min-w-40`}>
          <ThemedSelect
            id="student-storage-filter"
            value={view.filter}
            onValueChange={(value) =>
              set("filter", value as StorageLearnerFilter)
            }
            options={filterOptions}
            ariaLabel="Show"
            triggerClassName={`${filterSelectTriggerClasses} w-full`}
          />
        </div>

        <div className={`${filterControlClasses} min-w-44`}>
          <ThemedSelect
            id="student-storage-sort"
            value={view.sort}
            onValueChange={(value) => set("sort", value as StorageLearnerSort)}
            options={sortOptions}
            ariaLabel="Sort students"
            triggerClassName={`${filterSelectTriggerClasses} w-full`}
          />
        </div>

        {changed && (
          <button
            type="button"
            onClick={() => onChange(DEFAULT_STUDENT_STORAGE_VIEW)}
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
