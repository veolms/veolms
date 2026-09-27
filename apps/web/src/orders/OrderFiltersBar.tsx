import { memo, useMemo } from "react";
import type { OrderStatus } from "@veolms/contracts";
import { CalendarBlankIcon as CalendarBlank } from "@phosphor-icons/react/CalendarBlank";
import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { XIcon as X } from "@phosphor-icons/react/X";
import { useCourses } from "../services/courses";
import { useCouponsList } from "../services/coupons";
import { ThemedSelect, type ThemedSelectOption } from "../ThemedSelect";
import {
  SEARCH_SHORTCUT_ARIA_KEYSHORTCUTS,
  SearchShortcutHint,
} from "../searchShortcut";
import type { DateRangePreset } from "./useOrdersFilter";

export interface OrderFiltersBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  courseFilter: string | undefined;
  onCourseFilterChange: (courseId: string | undefined) => void;
  couponFilter: string | undefined;
  onCouponFilterChange: (couponId: string | undefined) => void;
  statusFilter: OrderStatus | undefined;
  onStatusFilterChange: (status: OrderStatus | undefined) => void;
  datePreset: DateRangePreset;
  dateLabel?: string;
  onDatePresetChange: (preset: DateRangePreset) => void;
  isFiltered: boolean;
  onResetFilters: () => void;
}

const statusOptions: readonly ThemedSelectOption<string>[] = [
  ["all", "All Statuses"],
  ["paid", "Completed"],
  ["payment_processing", "In Progress"],
  ["pending", "Processing"],
  ["refunded", "Refunded"],
];

const datePresetOptions: readonly ThemedSelectOption<DateRangePreset>[] = [
  ["all_time", "All Time", { flag: <CalendarBlank size={15} className="text-(--muted)" /> }],
  ["today", "Today", { flag: <CalendarBlank size={15} className="text-(--muted)" /> }],
  ["last_7_days", "Last 7 days", { flag: <CalendarBlank size={15} className="text-(--muted)" /> }],
  ["last_30_days", "Last 30 days", { flag: <CalendarBlank size={15} className="text-(--muted)" /> }],
  ["this_month", "This Month", { flag: <CalendarBlank size={15} className="text-(--muted)" /> }],
  ["last_month", "Last Month", { flag: <CalendarBlank size={15} className="text-(--muted)" /> }],
];

const selectBoxContainerClass =
  "flex min-h-9.75 items-center rounded-[9px] bg-[color-mix(in_srgb,var(--surface-strong)_72%,var(--canvas))] px-3 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_20%,transparent)] focus-within:shadow-[inset_0_0_0_1px_var(--accent),0_0_0_3px_color-mix(in_srgb,var(--accent)_16%,transparent)] transition-all";

const selectTriggerClass =
  "min-h-9.75! p-0! bg-transparent! shadow-none! border-0! text-xs md:text-sm font-medium text-(--text-secondary) hover:bg-transparent! hover:text-(--text)! focus:outline-none! flex items-center justify-between w-full";

export const OrderFiltersBar = memo(function OrderFiltersBar({
  searchQuery,
  onSearchChange,
  courseFilter,
  onCourseFilterChange,
  couponFilter,
  onCouponFilterChange,
  statusFilter,
  onStatusFilterChange,
  datePreset,
  onDatePresetChange,
  isFiltered,
  onResetFilters,
}: OrderFiltersBarProps) {
  const { data: coursesData } = useCourses();
  const { data: couponsData } = useCouponsList({ limit: 50 });

  // Course select options
  const courseOptions: readonly ThemedSelectOption<string>[] = useMemo(() => {
    const list: ThemedSelectOption<string>[] = [["all", "All Courses"]];
    if (coursesData?.courses) {
      for (const course of coursesData.courses) {
        list.push([course.id, course.title]);
      }
    }
    return list;
  }, [coursesData?.courses]);

  // Coupon select options
  const couponOptions: readonly ThemedSelectOption<string>[] = useMemo(() => {
    const list: ThemedSelectOption<string>[] = [["all", "All Coupons"]];
    const coupons = couponsData?.pages.flatMap((p) => p.items) ?? [];
    for (const coupon of coupons) {
      list.push([coupon.id, coupon.code]);
    }
    return list;
  }, [couponsData]);

  return (
    <div
      className="flex flex-col gap-2.5 sm:gap-3 rounded-[15px] border border-(--border) bg-(--card-surface) p-2.5 sm:p-3.5 transition-all"
      style={{ boxShadow: "var(--card-shadow)" }}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2.5">
        {/* Search Input */}
        <label className="flex min-h-9.75 w-full sm:min-w-56 sm:flex-1 items-center gap-2.5 rounded-[9px] bg-[color-mix(in_srgb,var(--surface-strong)_72%,var(--canvas))] px-3 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_20%,transparent)] focus-within:shadow-[inset_0_0_0_1px_var(--accent),0_0_0_3px_color-mix(in_srgb,var(--accent)_16%,transparent)] transition-all cursor-text">
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
            placeholder="Search orders by number, student, email..."
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

        {/* Dropdown Filters: 2 per row grid on mobile, flex on desktop */}
        <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:flex-wrap sm:w-auto sm:items-center sm:gap-2.5">
          {/* Date Range Select */}
          <div className={`${selectBoxContainerClass} min-w-0 sm:min-w-38`}>
            <ThemedSelect
              id="orders-date-filter"
              value={datePreset}
              onValueChange={(val) => onDatePresetChange(val as DateRangePreset)}
              options={datePresetOptions}
              ariaLabel="Filter by date range"
              triggerClassName={selectTriggerClass}
            />
          </div>

          {/* Course Filter Dropdown */}
          <div className={`${selectBoxContainerClass} min-w-0 sm:min-w-40`}>
            <ThemedSelect
              id="orders-course-filter"
              value={courseFilter || "all"}
              onValueChange={(val) =>
                onCourseFilterChange(val === "all" ? undefined : val)
              }
              options={courseOptions}
              searchable
              searchPlaceholder="Search courses..."
              defaultLimit={8}
              ariaLabel="Filter by course"
              triggerClassName={selectTriggerClass}
            />
          </div>

          {/* Coupon Filter Dropdown */}
          <div className={`${selectBoxContainerClass} min-w-0 sm:min-w-36`}>
            <ThemedSelect
              id="orders-coupon-filter"
              value={couponFilter || "all"}
              onValueChange={(val) =>
                onCouponFilterChange(val === "all" ? undefined : val)
              }
              options={couponOptions}
              searchable
              searchPlaceholder="Search coupons..."
              defaultLimit={8}
              ariaLabel="Filter by coupon"
              triggerClassName={selectTriggerClass}
            />
          </div>

          {/* Status Filter Dropdown */}
          <div className={`${selectBoxContainerClass} min-w-0 sm:min-w-36`}>
            <ThemedSelect
              id="orders-status-filter"
              value={statusFilter || "all"}
              onValueChange={(val) =>
                onStatusFilterChange(val === "all" ? undefined : (val as OrderStatus))
              }
              options={statusOptions}
              ariaLabel="Filter by status"
              triggerClassName={selectTriggerClass}
            />
          </div>
        </div>

        {/* Reset Filters button */}
        {isFiltered && (
          <button
            type="button"
            onClick={onResetFilters}
            className="flex min-h-9.75 items-center justify-center gap-1.5 rounded-[9px] border border-(--border) bg-(--card-surface) px-3 py-1.5 text-xs font-medium text-(--muted) hover:bg-(--hover) hover:text-(--text) transition-colors cursor-pointer w-full sm:w-auto shrink-0"
            title="Reset all filters"
          >
            <ArrowCounterClockwise size={14} />
            <span>Reset filters</span>
          </button>
        )}
      </div>
    </div>
  );
});
