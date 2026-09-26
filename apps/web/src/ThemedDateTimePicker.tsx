import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  CalendarBlank,
  CaretLeft,
  CaretRight,
  Clock,
  X,
} from "@phosphor-icons/react";
import { useBackDismiss } from "./navigation/useBackDismiss";

export interface ThemedDateTimePickerProps {
  id?: string;
  value: string; // ISO-like local datetime string "YYYY-MM-DDTHH:mm" or ""
  onChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

const FULL_MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

const DAY_HEADERS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

const joinClasses = (
  ...classes: Array<string | false | null | undefined>
): string => classes.filter(Boolean).join(" ");

interface PopoverPosition {
  left: number;
  top?: number;
  bottom?: number;
  width: number;
  side: "top" | "bottom";
}

function parseDateTime(value: string) {
  if (!value) return null;
  const [datePart, timePart] = value.split("T");
  if (!datePart) return null;
  const [yearStr, monthStr, dayStr] = datePart.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return null;

  let hour = 12;
  let minute = 0;
  if (timePart) {
    const [hourStr, minStr] = timePart.split(":");
    const h = Number(hourStr);
    const m = Number(minStr);
    if (!Number.isNaN(h)) hour = h;
    if (!Number.isNaN(m)) minute = m;
  }
  return { year, month: month - 1, day, hour, minute };
}

function formatToDateTimeLocal(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month + 1)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;
}

export function ThemedDateTimePicker({
  id,
  value,
  onChange,
  disabled = false,
  ariaLabel,
  placeholder = "Select date & time",
  className = "",
  triggerClassName = "",
  contentClassName = "",
}: ThemedDateTimePickerProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const hourListRef = useRef<HTMLDivElement>(null);
  const minuteListRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<PopoverPosition | null>(null);

  const parsed = useMemo(() => parseDateTime(value), [value]);

  const today = useMemo(() => {
    const now = new Date();
    return {
      year: now.getFullYear(),
      month: now.getMonth(),
      day: now.getDate(),
      hour: now.getHours(),
      minute: now.getMinutes(),
    };
  }, []);

  const [viewYear, setViewYear] = useState<number>(parsed?.year ?? today.year);
  const [viewMonth, setViewMonth] = useState<number>(parsed?.month ?? today.month);

  useEffect(() => {
    if (parsed) {
      setViewYear(parsed.year);
      setViewMonth(parsed.month);
    }
  }, [parsed]);

  const activeHour = parsed?.hour ?? (open ? today.hour : 12);
  const activeMinute = parsed?.minute ?? (open ? today.minute : 0);

  const displayLabel = useMemo(() => {
    if (!parsed) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${parsed.day} ${MONTH_NAMES[parsed.month]} ${parsed.year}, ${pad(parsed.hour)}:${pad(parsed.minute)}`;
  }, [parsed]);

  const calculatePosition = useCallback((): PopoverPosition | null => {
    const trigger = triggerRef.current;
    if (!trigger) return null;
    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 10;
    const gap = 6;
    const desiredWidth = Math.min(336, window.innerWidth - viewportPadding * 2);
    const desiredHeight = 356;

    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const spaceAbove = rect.top - viewportPadding;
    const useAbove = spaceBelow < desiredHeight && spaceAbove > spaceBelow;

    let left = rect.left;
    if (left + desiredWidth > window.innerWidth - viewportPadding) {
      left = Math.max(viewportPadding, rect.right - desiredWidth);
    }
    if (left < viewportPadding) {
      left = viewportPadding;
    }

    return {
      left,
      top: useAbove ? undefined : rect.bottom + gap,
      bottom: useAbove ? window.innerHeight - rect.top + gap : undefined,
      width: desiredWidth,
      side: useAbove ? "top" : "bottom",
    };
  }, []);

  const openPicker = () => {
    if (disabled) return;
    if (parsed) {
      setViewYear(parsed.year);
      setViewMonth(parsed.month);
    } else {
      setViewYear(today.year);
      setViewMonth(today.month);
    }
    const pos = calculatePosition();
    setPosition(pos);
    setOpen(true);

    requestAnimationFrame(() => {
      const selectedHourEl = hourListRef.current?.querySelector('[data-selected="true"]');
      selectedHourEl?.scrollIntoView({ block: "center", behavior: "auto" });
      const selectedMinEl = minuteListRef.current?.querySelector('[data-selected="true"]');
      selectedMinEl?.scrollIntoView({ block: "center", behavior: "auto" });
    });
  };

  const closePicker = (restoreFocus = false) => {
    setOpen(false);
    setPosition(null);
    if (restoreFocus) {
      requestAnimationFrame(() => triggerRef.current?.focus());
    }
  };

  useBackDismiss({
    open,
    onDismiss: () => closePicker(true),
  });

  useLayoutEffect(() => {
    if (open) {
      const pos = calculatePosition();
      if (pos) setPosition(pos);
    }
  }, [open, calculatePosition]);

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
    const reposition = () => {
      const pos = calculatePosition();
      if (pos) setPosition(pos);
    };
    const handleScroll = (event: Event) => {
      if (contentRef.current?.contains(event.target as Node)) return;
      closePicker();
    };

    document.addEventListener("pointerdown", closeFromOutside, true);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside, true);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [open, calculatePosition]);

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const calendarCells = useMemo(() => {
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    const cells: Array<{
      day: number;
      isCurrentMonth: boolean;
      monthOffset: number;
    }> = [];

    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      cells.push({
        day: daysInPrevMonth - i,
        isCurrentMonth: false,
        monthOffset: -1,
      });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({
        day: d,
        isCurrentMonth: true,
        monthOffset: 0,
      });
    }

    const totalCells = Math.ceil(cells.length / 7) * 7;
    const nextDaysNeeded = totalCells - cells.length;
    for (let d = 1; d <= nextDaysNeeded; d++) {
      cells.push({
        day: d,
        isCurrentMonth: false,
        monthOffset: 1,
      });
    }

    return cells;
  }, [viewYear, viewMonth]);

  const handleSelectDay = (day: number, monthOffset: number) => {
    const targetDate = new Date(viewYear, viewMonth + monthOffset, day);
    const targetYear = targetDate.getFullYear();
    const targetMonth = targetDate.getMonth();
    const targetDay = targetDate.getDate();

    if (monthOffset !== 0) {
      setViewYear(targetYear);
      setViewMonth(targetMonth);
    }

    onChange(
      formatToDateTimeLocal(
        targetYear,
        targetMonth,
        targetDay,
        activeHour,
        activeMinute,
      ),
    );
  };

  const handleSelectHour = (h: number) => {
    const y = parsed?.year ?? viewYear;
    const m = parsed?.month ?? viewMonth;
    const d = parsed?.day ?? today.day;
    onChange(formatToDateTimeLocal(y, m, d, h, activeMinute));
  };

  const handleSelectMinute = (min: number) => {
    const y = parsed?.year ?? viewYear;
    const m = parsed?.month ?? viewMonth;
    const d = parsed?.day ?? today.day;
    onChange(formatToDateTimeLocal(y, m, d, activeHour, min));
  };

  const handleSetNow = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const d = now.getDate();
    const h = now.getHours();
    const min = now.getMinutes();
    setViewYear(y);
    setViewMonth(m);
    onChange(formatToDateTimeLocal(y, m, d, h, min));
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      if (!open) openPicker();
      else closePicker();
    }
  };

  const handleContentKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closePicker(true);
    }
  };

  const isSelectedDate = (day: number, monthOffset: number) => {
    if (!parsed) return false;
    const cellDate = new Date(viewYear, viewMonth + monthOffset, day);
    return (
      parsed.year === cellDate.getFullYear() &&
      parsed.month === cellDate.getMonth() &&
      parsed.day === cellDate.getDate()
    );
  };

  const isTodayDate = (day: number, monthOffset: number) => {
    const cellDate = new Date(viewYear, viewMonth + monthOffset, day);
    return (
      today.year === cellDate.getFullYear() &&
      today.month === cellDate.getMonth() &&
      today.day === cellDate.getDate()
    );
  };

  return (
    <div className={joinClasses("relative w-full", className)}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => (open ? closePicker() : openPicker())}
        onKeyDown={handleTriggerKeyDown}
        aria-label={ariaLabel ? `${ariaLabel}: ${displayLabel || placeholder}` : displayLabel || placeholder}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={joinClasses(
          "flex w-full items-center justify-between gap-2 text-left transition-all",
          "h-9.5 sm:h-10 rounded-[10px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]",
          "bg-[color-mix(in_srgb,var(--canvas)_75%,var(--surface))] px-2.5 sm:px-3.5 text-xs sm:text-sm text-(--text)",
          "outline-none cursor-pointer select-none",
          open
            ? "border-(--accent) ring-2 ring-(--accent)/20"
            : "hover:border-[color-mix(in_srgb,var(--text)_22%,transparent)] focus:border-(--accent) focus:ring-2 focus:ring-(--accent)/20",
          disabled && "opacity-50 cursor-not-allowed",
          triggerClassName,
        )}
      >
        <span
          className={joinClasses(
            "truncate font-medium",
            !displayLabel && "text-(--muted)",
          )}
        >
          {displayLabel || placeholder}
        </span>
        <div className="flex items-center gap-1.5 shrink-0 text-(--muted)">
          {value && !disabled && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Clear date and time"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  onChange("");
                }
              }}
              className="p-1 rounded-md hover:text-(--text) hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X size={13} weight="bold" />
            </span>
          )}
          <CalendarBlank
            size={16}
            weight="duotone"
            className="text-(--accent) shrink-0"
          />
        </div>
      </button>

      {open &&
        position &&
        createPortal(
          <div
            ref={contentRef}
            role="dialog"
            aria-label={ariaLabel ?? "Date and time picker"}
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
            className={joinClasses(
              "rounded-[16px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]",
              "bg-[color-mix(in_srgb,var(--surface-strong,var(--surface))_96%,var(--canvas))]",
              "p-3 text-(--text) shadow-2xl backdrop-blur-md select-none",
              "animate-in fade-in zoom-in-95 duration-140",
              contentClassName,
            )}
          >
            <div className="flex flex-col gap-2.5">
              {/* Header: Month & Year navigation */}
              <div className="flex items-center justify-between gap-1 pb-2 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  aria-label="Previous month"
                  className="flex size-7 items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-(--text-secondary) hover:bg-(--accent)/15 hover:text-(--accent) active:scale-95 transition-all cursor-pointer"
                >
                  <CaretLeft size={14} weight="bold" />
                </button>
                <div className="text-xs sm:text-sm font-bold text-(--text) tracking-tight">
                  {FULL_MONTH_NAMES[viewMonth]} {viewYear}
                </div>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  aria-label="Next month"
                  className="flex size-7 items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-(--text-secondary) hover:bg-(--accent)/15 hover:text-(--accent) active:scale-95 transition-all cursor-pointer"
                >
                  <CaretRight size={14} weight="bold" />
                </button>
              </div>

              {/* Main content: Calendar Grid on left, Time picker on right */}
              <div className="flex gap-2.5">
                {/* Left: Day Grid */}
                <div className="flex-1 min-w-0">
                  {/* Day headers */}
                  <div className="grid grid-cols-7 gap-1 text-center mb-1">
                    {DAY_HEADERS.map((d) => (
                      <span
                        key={d}
                        className="text-[10px] font-bold text-(--muted) uppercase tracking-wider"
                      >
                        {d}
                      </span>
                    ))}
                  </div>

                  {/* Days grid */}
                  <div className="grid grid-cols-7 gap-1">
                    {calendarCells.map((cell, idx) => {
                      const selected = isSelectedDate(cell.day, cell.monthOffset);
                      const isToday = isTodayDate(cell.day, cell.monthOffset);
                      const cellDate = new Date(viewYear, viewMonth + cell.monthOffset, cell.day);
                      const dateAriaLabel = `${cell.day} ${FULL_MONTH_NAMES[cellDate.getMonth()]} ${cellDate.getFullYear()}`;
                      return (
                        <button
                          type="button"
                          key={`${cell.monthOffset}-${cell.day}-${idx}`}
                          onClick={() => handleSelectDay(cell.day, cell.monthOffset)}
                          aria-label={dateAriaLabel}
                          className={joinClasses(
                            "relative flex size-7 sm:size-7.5 items-center justify-center rounded-lg text-xs transition-all cursor-pointer",
                            selected
                              ? "bg-(--accent) text-(--on-accent-glyph,#000) font-bold shadow-xs scale-105 z-1"
                              : isToday
                                ? "border border-(--accent)/70 text-(--accent) font-semibold"
                                : cell.isCurrentMonth
                                  ? "font-medium text-(--text) hover:bg-(--accent)/15 hover:text-(--accent)"
                                  : "text-(--muted)/35 hover:text-(--muted)",
                          )}
                        >
                          {cell.day}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Vertical divider */}
                <div className="w-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)] shrink-0" />

                {/* Right: Time picker */}
                <div className="flex flex-col w-[88px] shrink-0">
                  <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-(--text-secondary) mb-1.5">
                    <Clock size={12} className="text-(--accent)" weight="bold" />
                    <span>Time</span>
                  </div>

                  <div className="grid grid-cols-2 gap-1 h-[176px]">
                    {/* Hours column */}
                    <div
                      ref={hourListRef}
                      style={{ scrollbarWidth: "none" }}
                      className="flex flex-col gap-1 overflow-y-auto overscroll-contain pr-0.5 scroll-smooth"
                    >
                      {HOURS.map((h) => {
                        const isHourSelected = activeHour === h;
                        return (
                          <button
                            type="button"
                            key={h}
                            data-selected={isHourSelected ? "true" : undefined}
                            onClick={() => handleSelectHour(h)}
                            aria-label={`Hour ${String(h).padStart(2, "0")}`}
                            className={joinClasses(
                              "flex h-7 w-full items-center justify-center rounded-md text-xs font-semibold transition-all shrink-0 cursor-pointer",
                              isHourSelected
                                ? "bg-(--accent) text-(--on-accent-glyph,#000) font-bold shadow-xs"
                                : "text-(--text-secondary) hover:bg-(--accent)/15 hover:text-(--accent)",
                            )}
                          >
                            {String(h).padStart(2, "0")}
                          </button>
                        );
                      })}
                    </div>

                    {/* Minutes column */}
                    <div
                      ref={minuteListRef}
                      style={{ scrollbarWidth: "none" }}
                      className="flex flex-col gap-1 overflow-y-auto overscroll-contain pr-0.5 scroll-smooth"
                    >
                      {MINUTES.map((m) => {
                        const isMinuteSelected = activeMinute === m;
                        return (
                          <button
                            type="button"
                            key={m}
                            data-selected={isMinuteSelected ? "true" : undefined}
                            onClick={() => handleSelectMinute(m)}
                            aria-label={`Minute ${String(m).padStart(2, "0")}`}
                            className={joinClasses(
                              "flex h-7 w-full items-center justify-center rounded-md text-xs font-semibold transition-all shrink-0 cursor-pointer",
                              isMinuteSelected
                                ? "bg-(--accent) text-(--on-accent-glyph,#000) font-bold shadow-xs"
                                : "text-(--text-secondary) hover:bg-(--accent)/15 hover:text-(--accent)",
                            )}
                          >
                            {String(m).padStart(2, "0")}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer actions */}
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                <button
                  type="button"
                  onClick={() => {
                    onChange("");
                    closePicker();
                  }}
                  className="text-xs font-semibold text-(--muted) hover:text-(--text) transition-colors px-1.5 py-1 cursor-pointer"
                >
                  Clear
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSetNow}
                    className="text-xs font-semibold text-(--accent) hover:underline px-1.5 py-1 transition-all cursor-pointer"
                  >
                    Now
                  </button>
                  <button
                    type="button"
                    onClick={() => closePicker(true)}
                    className="px-3 py-1 rounded-lg bg-(--accent) text-(--on-accent-glyph,#000) text-xs font-bold shadow-xs hover:brightness-105 active:scale-95 transition-all cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
