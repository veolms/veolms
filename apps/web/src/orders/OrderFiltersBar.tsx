import { memo, useMemo } from "react";
import type { OrderCourseOption, OrderFilterMode } from "@veolms/contracts";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { XIcon as X } from "@phosphor-icons/react/X";
import { useCouponsList } from "../services/coupons";
import {
  SEARCH_SHORTCUT_ARIA_KEYSHORTCUTS,
  SearchShortcutHint,
} from "../searchShortcut";
import { CourseThumb } from "./CourseThumb";
import {
  DEFAULT_STATUSES,
  STATUS_OPTIONS,
  courseFilterLabel,
  couponFilterLabel,
  selectedCourseIds,
  statusFilterLabel,
  type CourseSelection,
  type OrdersFilterState,
  type StatusKey,
} from "./ordersFilterModel";
import { getStatusTone } from "./orderHelpers";
import {
  MultiSelectFilter,
  type MultiSelectGroup,
} from "./filters/MultiSelectFilter";

export interface OrderFiltersBarProps {
  state: OrdersFilterState;
  courses: readonly OrderCourseOption[];
  coursesLoading: boolean;
  searchText: string;
  onSearchChange: (text: string) => void;
  onStatusesChange: (keys: readonly StatusKey[], mode: OrderFilterMode) => void;
  onCoursesChange: (selection: CourseSelection, mode: OrderFilterMode) => void;
  onCouponsChange: (ids: readonly string[], mode: OrderFilterMode) => void;
}

const STATUS_GROUPS: readonly MultiSelectGroup[] = [
  {
    id: "statuses",
    options: STATUS_OPTIONS.map((option) => ({
      id: option.key,
      label: option.label,
      leading: (
        <span
          aria-hidden="true"
          className={`size-2 shrink-0 rounded-full ${getStatusTone(option.statuses[0]).dot}`}
        />
      ),
    })),
  },
];

const filterButtonWidth = "w-full sm:w-auto sm:max-w-[15rem]";

/**
 * Status, Course and Coupon, then a search box taking the rest of the row.
 * On a phone the three filters share a row and the search sits under them.
 */
export const OrderFiltersBar = memo(function OrderFiltersBar({
  state,
  courses,
  coursesLoading,
  searchText,
  onSearchChange,
  onStatusesChange,
  onCoursesChange,
  onCouponsChange,
}: OrderFiltersBarProps) {
  const { data: couponsData, isLoading: couponsLoading } = useCouponsList({
    limit: 100,
    refetchInterval: false,
  });
  const coupons = useMemo(
    () => couponsData?.pages.flatMap((page) => page.items) ?? [],
    [couponsData],
  );
  const couponCodes = useMemo(
    () => new Map(coupons.map((coupon) => [coupon.id, coupon.code])),
    [coupons],
  );

  const courseGroups = useMemo<MultiSelectGroup[]>(() => {
    const option = (course: OrderCourseOption) => ({
      id: course.id,
      label: course.title,
      leading: (
        <CourseThumb title={course.title} url={course.thumbnailUrl} size="sm" />
      ),
    });
    return [
      {
        id: "paid",
        title: "Paid courses",
        options: courses.filter((course) => !course.isFree).map(option),
      },
      {
        id: "free",
        title: "Free courses",
        options: courses.filter((course) => course.isFree).map(option),
      },
    ].filter((group) => group.options.length > 0);
  }, [courses]);

  const paidIds = useMemo(
    () => selectedCourseIds("default", courses),
    [courses],
  );

  const statusLabel = statusFilterLabel(state.statuses, state.statusMode);
  const firstStatus = STATUS_OPTIONS.find(
    (option) => option.key === state.statuses[0],
  );

  return (
    <div className="flex flex-col gap-2.5 md:flex-row md:items-center">
      <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap md:flex-nowrap">
        <MultiSelectFilter
          name="Status"
          noun="statuses"
          buttonLabel={statusLabel}
          buttonLeading={
            state.statuses.length === 1 &&
            state.statusMode === "include" &&
            firstStatus ? (
              <span
                aria-hidden="true"
                className={`size-2 shrink-0 rounded-full ${getStatusTone(firstStatus.statuses[0]).dot}`}
              />
            ) : undefined
          }
          groups={STATUS_GROUPS}
          value={{ selected: state.statuses, mode: state.statusMode }}
          defaultValue={{ selected: DEFAULT_STATUSES, mode: "include" }}
          onChange={({ selected, mode }) =>
            onStatusesChange(selected as StatusKey[], mode)
          }
          triggerClassName={filterButtonWidth}
          contentClassName="w-[19rem]"
        />
        <MultiSelectFilter
          name="Course"
          noun="courses"
          buttonLabel={courseFilterLabel(
            state.courses,
            state.courseMode,
            courses,
          )}
          groups={courseGroups}
          isLoading={coursesLoading}
          emptyText="No courses yet."
          value={{
            selected: selectedCourseIds(state.courses, courses),
            mode: state.courseMode,
          }}
          defaultValue={{ selected: paidIds, mode: "include" }}
          onChange={({ selected, mode }) => {
            const allPaid =
              mode === "include" &&
              selected.length === paidIds.length &&
              selected.every((id) => paidIds.includes(id));
            onCoursesChange(allPaid ? "default" : selected, mode);
          }}
          searchPlaceholder="Find a course"
          triggerClassName={filterButtonWidth}
          contentClassName="w-[24rem]"
        />
        <MultiSelectFilter
          name="Coupon"
          noun="coupons"
          buttonLabel={couponFilterLabel(
            state.coupons,
            state.couponMode,
            couponCodes,
          )}
          groups={[
            {
              id: "coupons",
              options: coupons.map((coupon) => ({
                id: coupon.id,
                label: coupon.code,
              })),
            },
          ]}
          isLoading={couponsLoading}
          emptyText="No coupons yet."
          value={{ selected: state.coupons, mode: state.couponMode }}
          defaultValue={{ selected: [], mode: "include" }}
          onChange={({ selected, mode }) => onCouponsChange(selected, mode)}
          searchPlaceholder="Find a coupon"
          triggerClassName={filterButtonWidth}
          contentClassName="w-[20rem]"
        />
      </div>

      <label className="flex h-11 min-w-0 flex-1 cursor-text items-center gap-2.5 rounded-xl border border-(--border) bg-(--card-surface) px-3.5 focus-within:border-(--accent) focus-within:ring-2 focus-within:ring-(--accent)/20">
        <MagnifyingGlass
          size={17}
          className="shrink-0 text-(--muted)"
          aria-hidden="true"
        />
        <input
          id="orders-search-input"
          type="text"
          value={searchText}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search by name, email or order ID"
          aria-label="Search by name, email or order ID"
          aria-keyshortcuts={SEARCH_SHORTCUT_ARIA_KEYSHORTCUTS}
          data-search-shortcut-target
          maxLength={100}
          className="w-full min-w-0 border-0 bg-transparent p-0 text-sm text-(--text) outline-none placeholder:text-(--muted)"
        />
        <SearchShortcutHint />
        {searchText && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            aria-label="Clear search"
            className="grid size-7 shrink-0 place-items-center rounded-md text-(--muted) hover:bg-(--hover) hover:text-(--text)"
          >
            <X size={14} aria-hidden="true" />
          </button>
        )}
      </label>
    </div>
  );
});
