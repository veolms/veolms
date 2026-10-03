import { useState } from "react";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { FunnelIcon as Funnel } from "@phosphor-icons/react/Funnel";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { XIcon as X } from "@phosphor-icons/react/X";
import { ThemedSelect } from "../ThemedSelect";
import { SEARCH_SHORTCUT_ARIA_KEYSHORTCUTS, SearchShortcutHint } from "../searchShortcut";
import type { RatingFilterOption, SortOption } from "./useReviewsFilter";

export interface ReviewFiltersBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  ratingFilter: RatingFilterOption;
  onRatingFilterChange: (rating: RatingFilterOption) => void;
  sortBy: SortOption;
  onSortByChange: (sort: SortOption) => void;
  verifiedOnly: boolean;
  onToggleVerified: () => void;
  onOpenAdvancedFilters?: () => void;
}

const ratingOptions: readonly [RatingFilterOption, string][] = [
  ["all", "All ratings"],
  ["5", "5 stars only"],
  ["4", "4 stars only"],
  ["3", "3 stars only"],
  ["2", "2 stars only"],
  ["1", "1 star only"],
];

const sortOptions: readonly [SortOption, string][] = [
  ["recent", "Most recent"],
  ["highest", "Highest rated"],
  ["lowest", "Lowest rated"],
  ["helpful", "Most helpful"],
];

export function ReviewFiltersBar({
  searchQuery,
  onSearchChange,
  ratingFilter,
  onRatingFilterChange,
  sortBy,
  onSortByChange,
  verifiedOnly,
  onToggleVerified,
  onOpenAdvancedFilters,
}: ReviewFiltersBarProps) {
  const [extraFiltersOpen, setExtraFiltersOpen] = useState(false);

  const handleFilterClick = () => {
    if (onOpenAdvancedFilters) {
      onOpenAdvancedFilters();
    } else {
      setExtraFiltersOpen((prev) => !prev);
    }
  };

  return (
    <div
      className="flex flex-col gap-3 rounded-[15px] border border-(--border) bg-(--card-surface) p-3 transition-all md:p-3.5"
      style={{ boxShadow: "var(--card-shadow)" }}
    >
      <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
        {/* Search Input */}
        <label className="flex min-h-9.75 min-w-52.5 flex-1 cursor-text items-center gap-2.5 rounded-[9px] bg-[color-mix(in_srgb,var(--surface-strong)_72%,var(--canvas))] px-3 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_20%,transparent)] transition-all focus-within:shadow-[inset_0_0_0_1px_var(--accent),0_0_0_3px_color-mix(in_srgb,var(--accent)_16%,transparent)]">
          <MagnifyingGlass size={17} className="shrink-0 text-(--muted)" aria-hidden="true" />
          <input
            id="reviews-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search reviews..."
            aria-label="Search reviews"
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

        {/* Rating Select Container */}
        <div className="flex min-h-9.75 w-35 items-center rounded-[9px] bg-[color-mix(in_srgb,var(--surface-strong)_72%,var(--canvas))] px-3 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_20%,transparent)] transition-all focus-within:shadow-[inset_0_0_0_1px_var(--accent),0_0_0_3px_color-mix(in_srgb,var(--accent)_16%,transparent)]">
          <ThemedSelect
            id="reviews-rating-filter"
            value={ratingFilter}
            onValueChange={onRatingFilterChange}
            options={ratingOptions}
            ariaLabel="Filter by rating"
            triggerClassName="min-h-9.75! p-0! bg-transparent! shadow-none! border-0! text-xs md:text-sm font-medium text-(--text-secondary) hover:bg-transparent! hover:text-(--text)! focus:outline-none! flex items-center justify-between w-full"
          />
        </div>

        {/* Sort Select Container */}
        <div className="flex min-h-9.75 w-36.25 items-center rounded-[9px] bg-[color-mix(in_srgb,var(--surface-strong)_72%,var(--canvas))] px-3 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_20%,transparent)] transition-all focus-within:shadow-[inset_0_0_0_1px_var(--accent),0_0_0_3px_color-mix(in_srgb,var(--accent)_16%,transparent)]">
          <ThemedSelect
            id="reviews-sort-filter"
            value={sortBy}
            onValueChange={onSortByChange}
            options={sortOptions}
            ariaLabel="Sort reviews by"
            triggerClassName="min-h-9.75! p-0! bg-transparent! shadow-none! border-0! text-xs md:text-sm font-medium text-(--text-secondary) hover:bg-transparent! hover:text-(--text)! focus:outline-none! flex items-center justify-between w-full"
          />
        </div>

        {/* Verified Learners Checkbox Chip */}
        <button
          type="button"
          role="checkbox"
          aria-checked={verifiedOnly}
          onClick={onToggleVerified}
          className={`flex min-h-9.75 cursor-pointer items-center gap-2 rounded-[9px] px-3.5 text-xs font-medium transition-all select-none md:text-sm ${
            verifiedOnly
              ? "bg-(--accent-soft) text-(--accent) shadow-[inset_0_0_0_1px_var(--accent)]"
              : "bg-[color-mix(in_srgb,var(--surface-strong)_72%,var(--canvas))] text-(--muted) shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_20%,transparent)] hover:text-(--text)"
          }`}
        >
          <span
            className={`flex h-4 w-4 items-center justify-center rounded transition-colors ${
              verifiedOnly
                ? "bg-(--accent) text-white"
                : "border border-(--border-strong,var(--border)) bg-transparent"
            }`}
          >
            {verifiedOnly && <Check size={11} weight="bold" />}
          </span>
          <span>Verified learners</span>
        </button>

        {/* Filters Quick Button */}
        <button
          type="button"
          onClick={handleFilterClick}
          aria-label="Toggle filters"
          aria-expanded={extraFiltersOpen}
          className="flex min-h-9.75 cursor-pointer items-center gap-1.5 rounded-[9px] bg-[color-mix(in_srgb,var(--surface-strong)_72%,var(--canvas))] px-3.5 text-xs font-medium text-(--text) shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_20%,transparent)] transition-all hover:bg-(--hover) md:text-sm"
        >
          <Funnel size={15} />
          <span>Filters</span>
        </button>
      </div>

      {/* Expandable Extra Filters Drawer if toggled */}
      {extraFiltersOpen && (
        <div className="animate-in fade-in slide-in-from-top-1 flex flex-wrap items-center gap-2 rounded-[10px] bg-[color-mix(in_srgb,var(--surface-strong)_79%,var(--canvas))] p-2.5 text-xs text-(--text-secondary) shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text)_7%,transparent)] duration-150">
          <span className="font-semibold text-(--text)">Quick filters:</span>
          <button
            type="button"
            onClick={() => onRatingFilterChange("5")}
            className="cursor-pointer rounded-lg bg-(--hover) px-2.5 py-1 text-xs hover:text-(--text)"
          >
            ★ 5 Stars Only
          </button>
          <button
            type="button"
            onClick={() => onSortByChange("helpful")}
            className="cursor-pointer rounded-lg bg-(--hover) px-2.5 py-1 text-xs hover:text-(--text)"
          >
            Most Helpful
          </button>
          <button
            type="button"
            onClick={() => onSortByChange("recent")}
            className="cursor-pointer rounded-lg bg-(--hover) px-2.5 py-1 text-xs hover:text-(--text)"
          >
            Newest First
          </button>
        </div>
      )}
    </div>
  );
}
