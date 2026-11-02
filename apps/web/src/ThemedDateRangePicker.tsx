import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { CalendarBlank } from "@phosphor-icons/react/CalendarBlank";
import { CaretLeft } from "@phosphor-icons/react/CaretLeft";
import { CaretDown } from "@phosphor-icons/react/CaretDown";
import { CaretRight } from "@phosphor-icons/react/CaretRight";
import { useBackDismiss } from "./navigation/useBackDismiss";
import {
  DAY_HEADERS,
  FULL_MONTH_NAMES,
  MONTH_NAMES,
  buildCalendarCells,
  joinClasses,
  pickerContentClassName,
  pickerNavButtonClassName,
  pickerTriggerClassName,
  pickerTriggerIdleClassName,
  pickerTriggerOpenClassName,
} from "./ThemedDateTimePicker";

/** Two calendar days, `YYYY-MM-DD`, the first not after the last. */
export interface DateRangeValue {
  from: string;
  to: string;
}

export interface ThemedDateRangePickerProps {
  id?: string;
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  /** The first and last days that may be picked, `YYYY-MM-DD`. */
  min?: string;
  max?: string;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (year: number, month: number, day: number) =>
  `${year}-${pad(month + 1)}-${pad(day)}`;

function parseDayKey(value: string) {
  const [year = 1970, month = 1, day = 1] = value.split("-").map(Number);
  return { year, month: month - 1, day };
}

function dayLabel(value: string): string {
  const { year, month, day } = parseDayKey(value);
  return `${day} ${MONTH_NAMES[month]} ${year}`;
}

/** Inclusive length, for the footer ("30 days"). */
function lengthInDays(from: string, to: string): number {
  const start = Date.UTC(...ymd(from));
  const end = Date.UTC(...ymd(to));
  return Math.round((end - start) / 86_400_000) + 1;
}

function ymd(value: string): [number, number, number] {
  const { year, month, day } = parseDayKey(value);
  return [year, month, day];
}

/** A month and the one after it, as a year and a month index. */
function shiftMonth(year: number, month: number, by: number) {
  const date = new Date(year, month + by, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

/** A month title: opens the month and year chooser. */
const monthTitleClassName =
  "inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold tracking-tight text-(--text) transition-colors hover:bg-(--accent)/15 hover:text-(--accent) sm:text-sm";

/** A month or a year in the chooser, drawn as the day cells are. */
function chooserCellClassName(selected: boolean, blocked: boolean): string {
  return joinClasses(
    "flex h-9 items-center justify-center rounded-lg text-xs font-semibold transition-all",
    blocked
      ? "cursor-not-allowed text-(--muted)/25"
      : selected
        ? "cursor-pointer bg-(--accent) font-bold text-(--on-accent-glyph,#000) shadow-xs"
        : "cursor-pointer text-(--text) hover:bg-(--accent)/15 hover:text-(--accent)",
  );
}

const YEARS_PER_PAGE = 12;

/**
 * Jumps to any month: twelve months of a year, and from the year's title
 * twelve years at a time. Months and years with no day that may be picked
 * are shown but not offered.
 */
function MonthYearChooser({
  initialYear,
  selectedMonth,
  isMonthBlocked,
  isYearBlocked,
  onPick,
}: {
  initialYear: number;
  selectedMonth: { year: number; month: number };
  isMonthBlocked: (year: number, month: number) => boolean;
  isYearBlocked: (year: number) => boolean;
  onPick: (year: number, month: number) => void;
}) {
  const [level, setLevel] = useState<"month" | "year">("month");
  const [year, setYear] = useState(initialYear);
  // The page of years ends with the one being looked at, near today.
  const [pageStart, setPageStart] = useState(initialYear - YEARS_PER_PAGE + 1);
  const pageEnd = pageStart + YEARS_PER_PAGE - 1;

  return (
    <>
      <div className="flex items-center justify-between gap-1 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] pb-2">
        <button
          type="button"
          onClick={() =>
            level === "month"
              ? setYear(year - 1)
              : setPageStart(pageStart - YEARS_PER_PAGE)
          }
          disabled={
            level === "month"
              ? isYearBlocked(year - 1)
              : isYearBlocked(pageStart - 1)
          }
          aria-label={level === "month" ? "Previous year" : "Earlier years"}
          className={pickerNavButtonClassName}
        >
          <CaretLeft size={14} weight="bold" />
        </button>
        {level === "month" ? (
          <button
            type="button"
            onClick={() => {
              setPageStart(year - YEARS_PER_PAGE + 1);
              setLevel("year");
            }}
            aria-label={`${year}: choose another year`}
            className={monthTitleClassName}
          >
            {year}
            <CaretDown size={11} weight="bold" aria-hidden="true" />
          </button>
        ) : (
          <span className="text-xs font-bold tracking-tight text-(--text) sm:text-sm">
            {pageStart} – {pageEnd}
          </span>
        )}
        <button
          type="button"
          onClick={() =>
            level === "month"
              ? setYear(year + 1)
              : setPageStart(pageStart + YEARS_PER_PAGE)
          }
          disabled={
            level === "month"
              ? isYearBlocked(year + 1)
              : isYearBlocked(pageEnd + 1)
          }
          aria-label={level === "month" ? "Next year" : "Later years"}
          className={pickerNavButtonClassName}
        >
          <CaretRight size={14} weight="bold" />
        </button>
      </div>

      {level === "month" ? (
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
          {MONTH_NAMES.map((name, month) => {
            const blocked = isMonthBlocked(year, month);
            const selected =
              year === selectedMonth.year && month === selectedMonth.month;
            return (
              <button
                key={name}
                type="button"
                disabled={blocked}
                onClick={() => onPick(year, month)}
                aria-label={`${FULL_MONTH_NAMES[month]} ${year}`}
                aria-pressed={selected}
                className={chooserCellClassName(selected, blocked)}
              >
                {name}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
          {Array.from({ length: YEARS_PER_PAGE }, (_, index) => {
            const option = pageStart + index;
            const blocked = isYearBlocked(option);
            return (
              <button
                key={option}
                type="button"
                disabled={blocked}
                onClick={() => {
                  setYear(option);
                  setLevel("month");
                }}
                aria-pressed={option === year}
                className={chooserCellClassName(option === year, blocked)}
              >
                {option}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

/** Two months side by side where they fit, one on a phone. */
const TWO_MONTHS_MIN_WIDTH = 640;
const MONTH_WIDTH = 252;

interface PopoverPosition {
  left: number;
  top?: number;
  bottom?: number;
  width: number;
}

/**
 * Picks a range of days on one calendar: the first click marks where it
 * starts, the second where it ends (in either order), and the days between
 * are drawn as one band. Built from the date picker's own trigger, popover
 * and day cells, so the two look alike.
 */
export function ThemedDateRangePicker({
  id,
  value,
  onChange,
  min,
  max,
  disabled = false,
  ariaLabel = "Date range",
  className = "",
}: ThemedDateRangePickerProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  const [monthsShown, setMonthsShown] = useState(1);
  // The left month on show.
  const [view, setView] = useState<{ year: number; month: number }>(() =>
    parseDayKey(value.to),
  );
  // While picking: the first day clicked, and the day under the pointer.
  const [anchor, setAnchor] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  // The month and year chooser, opened from one of the month titles.
  const [chooser, setChooser] = useState<{
    year: number;
    slot: number;
  } | null>(null);

  const label = `${dayLabel(value.from)} – ${dayLabel(value.to)}`;

  const calculatePosition = useCallback(
    (months: number): PopoverPosition | null => {
      const trigger = triggerRef.current;
      if (!trigger) return null;
      const rect = trigger.getBoundingClientRect();
      const viewportPadding = 10;
      const gap = 6;
      const desiredWidth = Math.min(
        months * MONTH_WIDTH + (months - 1) * 24 + 24,
        window.innerWidth - viewportPadding * 2,
      );
      const desiredHeight = 340;
      const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
      const useAbove =
        spaceBelow < desiredHeight && rect.top - viewportPadding > spaceBelow;
      let left = rect.left;
      if (left + desiredWidth > window.innerWidth - viewportPadding) {
        left = Math.max(viewportPadding, rect.right - desiredWidth);
      }
      return {
        left: Math.max(viewportPadding, left),
        top: useAbove ? undefined : rect.bottom + gap,
        bottom: useAbove ? window.innerHeight - rect.top + gap : undefined,
        width: desiredWidth,
      };
    },
    [],
  );

  const openPicker = () => {
    if (disabled) return;
    const months = window.innerWidth >= TWO_MONTHS_MIN_WIDTH ? 2 : 1;
    // The range's last month on the right, where it is easiest to extend.
    const end = parseDayKey(value.to);
    setView(months === 2 ? shiftMonth(end.year, end.month, -1) : end);
    setMonthsShown(months);
    setAnchor(null);
    setHovered(null);
    setChooser(null);
    setPosition(calculatePosition(months));
    setOpen(true);
  };

  const closePicker = (restoreFocus = false) => {
    setOpen(false);
    setPosition(null);
    setAnchor(null);
    setHovered(null);
    setChooser(null);
    if (restoreFocus) {
      requestAnimationFrame(() => triggerRef.current?.focus());
    }
  };

  useBackDismiss({ open, onDismiss: () => closePicker(true) });

  useLayoutEffect(() => {
    if (open) setPosition(calculatePosition(monthsShown));
  }, [open, monthsShown, calculatePosition]);

  useEffect(() => {
    if (!open) return undefined;
    const closeFromOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        contentRef.current?.contains(target)
      ) {
        return;
      }
      closePicker();
    };
    const reposition = () => setPosition(calculatePosition(monthsShown));
    const closeOnScroll = (event: Event) => {
      if (contentRef.current?.contains(event.target as Node)) return;
      closePicker();
    };
    document.addEventListener("pointerdown", closeFromOutside, true);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", closeOnScroll, true);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside, true);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", closeOnScroll, true);
    };
  }, [open, monthsShown, calculatePosition]);

  const pickDay = (key: string) => {
    if (!anchor) {
      setAnchor(key);
      return;
    }
    const [from, to] = anchor <= key ? [anchor, key] : [key, anchor];
    onChange({ from, to });
    closePicker(true);
  };

  // What is drawn as the range: the one being picked, or the current one.
  const pendingEnd = hovered ?? anchor;
  const [rangeFrom, rangeTo] = anchor
    ? anchor <= pendingEnd!
      ? [anchor, pendingEnd!]
      : [pendingEnd!, anchor]
    : [value.from, value.to];

  const today = (() => {
    const now = new Date();
    return dayKey(now.getFullYear(), now.getMonth(), now.getDate());
  })();
  const isOutOfRange = (key: string) =>
    Boolean((min && key < min) || (max && key > max));
  /** A month or a year with no day that may be picked. */
  const isMonthBlocked = (year: number, month: number) =>
    Boolean(
      (max && dayKey(year, month, 1) > max) ||
      (min &&
        dayKey(year, month, new Date(year, month + 1, 0).getDate()) < min),
    );
  const isYearBlocked = (year: number) =>
    Boolean((max && `${year}-01-01` > max) || (min && `${year}-12-31` < min));
  /**
   * The left month that puts the chosen one in the column its title was
   * clicked in, moved back when that would leave a month with no day that
   * may be picked on the right.
   */
  const leftMonthFor = (year: number, month: number, slot: number) => {
    let left = shiftMonth(year, month, -Math.min(slot, monthsShown - 1));
    const right = shiftMonth(left.year, left.month, monthsShown - 1);
    if (monthsShown > 1 && isMonthBlocked(right.year, right.month)) {
      left = shiftMonth(left.year, left.month, -1);
    }
    return left;
  };

  const lastShown = shiftMonth(view.year, view.month, monthsShown - 1);
  const nextBlocked = Boolean(
    max && dayKey(lastShown.year, lastShown.month, 31) >= max,
  );
  const prevBlocked = Boolean(min && dayKey(view.year, view.month, 1) <= min);

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      if (open) closePicker();
      else openPicker();
    }
  };

  const handleContentKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closePicker(true);
    }
  };

  const months = Array.from({ length: monthsShown }, (_, index) =>
    shiftMonth(view.year, view.month, index),
  );

  return (
    <div className={joinClasses("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => (open ? closePicker() : openPicker())}
        onKeyDown={handleTriggerKeyDown}
        aria-label={`${ariaLabel}: ${label}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={joinClasses(
          pickerTriggerClassName,
          open ? pickerTriggerOpenClassName : pickerTriggerIdleClassName,
          disabled && "opacity-50 cursor-not-allowed",
        )}
      >
        <span className="truncate font-medium">{label}</span>
        <CalendarBlank
          size={16}
          weight="duotone"
          className="shrink-0 text-(--accent)"
        />
      </button>

      {open &&
        position &&
        createPortal(
          <div
            ref={contentRef}
            role="dialog"
            aria-label={ariaLabel}
            aria-modal="true"
            onKeyDown={handleContentKeyDown}
            style={
              {
                position: "fixed",
                left: position.left,
                top: position.top,
                bottom: position.bottom,
                width: position.width,
                boxSizing: "border-box",
                zIndex: 700,
              } as CSSProperties
            }
            className={pickerContentClassName}
          >
            <div className="flex flex-col gap-2.5">
              {chooser ? (
                <MonthYearChooser
                  initialYear={chooser.year}
                  selectedMonth={months[chooser.slot] ?? view}
                  isMonthBlocked={isMonthBlocked}
                  isYearBlocked={isYearBlocked}
                  onPick={(year, month) => {
                    setView(leftMonthFor(year, month, chooser.slot));
                    setChooser(null);
                  }}
                />
              ) : (
                <>
                  <div className="flex items-center justify-between gap-1 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] pb-2">
                    <button
                      type="button"
                      onClick={() =>
                        setView(shiftMonth(view.year, view.month, -1))
                      }
                      disabled={prevBlocked}
                      aria-label="Previous month"
                      className={pickerNavButtonClassName}
                    >
                      <CaretLeft size={14} weight="bold" />
                    </button>
                    <div className="flex flex-1 justify-around">
                      {months.map(({ year, month }, slot) => (
                        // The title opens the month and year chooser, to jump
                        // further than one month at a time.
                        <button
                          key={`${year}-${month}`}
                          type="button"
                          onClick={() => setChooser({ year, slot })}
                          aria-label={`${FULL_MONTH_NAMES[month]} ${year}: choose another month or year`}
                          className={monthTitleClassName}
                        >
                          {FULL_MONTH_NAMES[month]} {year}
                          <CaretDown
                            size={11}
                            weight="bold"
                            aria-hidden="true"
                          />
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setView(shiftMonth(view.year, view.month, 1))
                      }
                      disabled={nextBlocked}
                      aria-label="Next month"
                      className={pickerNavButtonClassName}
                    >
                      <CaretRight size={14} weight="bold" />
                    </button>
                  </div>

                  <div className="flex gap-6">
                    {months.map(({ year, month }) => (
                      <div
                        key={`${year}-${month}`}
                        className="min-w-0 flex-1"
                        onPointerLeave={() => setHovered(null)}
                      >
                        <div className="mb-1 grid grid-cols-7 text-center">
                          {DAY_HEADERS.map((header) => (
                            <span
                              key={header}
                              className="text-[10px] font-bold tracking-wider text-(--muted) uppercase"
                            >
                              {header}
                            </span>
                          ))}
                        </div>
                        <div className="grid grid-cols-7 gap-y-1">
                          {buildCalendarCells(year, month).map(
                            (cell, index) => {
                              // Only the month's own days: the next month's grid
                              // shows the rest.
                              if (!cell.isCurrentMonth) {
                                return <span key={`blank-${index}`} />;
                              }
                              const key = dayKey(year, month, cell.day);
                              const outOfRange = isOutOfRange(key);
                              const isEdge =
                                key === rangeFrom || key === rangeTo;
                              const inBand = key > rangeFrom && key < rangeTo;
                              const isStart =
                                key === rangeFrom && rangeFrom !== rangeTo;
                              const isEnd =
                                key === rangeTo && rangeFrom !== rangeTo;
                              return (
                                <div
                                  key={key}
                                  className={joinClasses(
                                    "flex justify-center",
                                    (inBand || isStart || isEnd) &&
                                      "bg-(--accent)/12",
                                    isStart && "rounded-l-lg",
                                    isEnd && "rounded-r-lg",
                                  )}
                                >
                                  <button
                                    type="button"
                                    disabled={outOfRange}
                                    onClick={() => pickDay(key)}
                                    onPointerEnter={() =>
                                      anchor && setHovered(key)
                                    }
                                    aria-label={`${cell.day} ${FULL_MONTH_NAMES[month]} ${year}`}
                                    aria-pressed={isEdge}
                                    className={joinClasses(
                                      "relative flex size-7 items-center justify-center rounded-lg text-xs transition-all sm:size-7.5",
                                      outOfRange
                                        ? "cursor-not-allowed text-(--muted)/25"
                                        : isEdge
                                          ? "z-1 cursor-pointer bg-(--accent) font-bold text-(--on-accent-glyph,#000) shadow-xs"
                                          : inBand
                                            ? "cursor-pointer font-medium text-(--text) hover:bg-(--accent)/20 hover:text-(--accent)"
                                            : key === today
                                              ? "cursor-pointer border border-(--accent)/70 font-semibold text-(--accent)"
                                              : "cursor-pointer font-medium text-(--text) hover:bg-(--accent)/15 hover:text-(--accent)",
                                    )}
                                  >
                                    {cell.day}
                                  </button>
                                </div>
                              );
                            },
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div className="flex items-center justify-between gap-2 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] pt-2 text-xs">
                <span className="text-(--muted)" aria-live="polite">
                  {anchor
                    ? `From ${dayLabel(anchor)} — now pick the last day`
                    : `${dayLabel(value.from)} – ${dayLabel(value.to)} · ${lengthInDays(value.from, value.to)} ${lengthInDays(value.from, value.to) === 1 ? "day" : "days"}`}
                </span>
                {anchor ? (
                  <button
                    type="button"
                    onClick={() => {
                      setAnchor(null);
                      setHovered(null);
                    }}
                    className="cursor-pointer px-1.5 py-1 font-semibold text-(--muted) transition-colors hover:text-(--text)"
                  >
                    Start over
                  </button>
                ) : null}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
