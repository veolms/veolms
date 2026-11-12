import { useRef, useState, type KeyboardEvent } from "react";
import { CaretLeftIcon as CaretLeft } from "@phosphor-icons/react/CaretLeft";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/CaretRight";
import { startOfDay, toDayKey } from "../ordersDateRange";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTH = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
});
const DAY_LABEL = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

export interface RangeCalendarProps {
  from: Date | null;
  to: Date | null;
  today: Date;
  onPick: (from: Date | null, to: Date | null) => void;
}

function sameDay(a: Date | null, b: Date | null): boolean {
  return Boolean(a && b && toDayKey(a) === toDayKey(b));
}

/**
 * One month to pick a range of days from: the first click starts the
 * range, the second ends it (in either order). Today is outlined and later
 * days cannot be picked. Arrow keys move between days.
 */
export function RangeCalendar({ from, to, today, onPick }: RangeCalendarProps) {
  const todayStart = startOfDay(today);
  const [month, setMonth] = useState(
    () =>
      new Date(
        (from ?? todayStart).getFullYear(),
        (from ?? todayStart).getMonth(),
        1,
      ),
  );
  const [focused, setFocused] = useState<Date>(from ?? todayStart);
  const gridRef = useRef<HTMLDivElement>(null);

  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7; // Monday first
  const daysInMonth = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0,
  ).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from(
      { length: daysInMonth },
      (_, index) => new Date(month.getFullYear(), month.getMonth(), index + 1),
    ),
  ];
  const nextMonthStart = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  const canGoNext = nextMonthStart <= todayStart;

  const pick = (day: Date) => {
    if (day > todayStart) return;
    if (!from || to) onPick(day, null);
    else onPick(from <= day ? from : day, from <= day ? day : from);
  };

  const moveFocus = (date: Date) => {
    const clamped = date > todayStart ? todayStart : date;
    setFocused(clamped);
    if (
      clamped.getMonth() !== month.getMonth() ||
      clamped.getFullYear() !== month.getFullYear()
    ) {
      setMonth(new Date(clamped.getFullYear(), clamped.getMonth(), 1));
    }
    requestAnimationFrame(() =>
      gridRef.current
        ?.querySelector<HTMLButtonElement>(`[data-day="${toDayKey(clamped)}"]`)
        ?.focus(),
    );
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const step: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    if (!(event.key in step)) return;
    event.preventDefault();
    moveFocus(
      new Date(
        focused.getFullYear(),
        focused.getMonth(),
        focused.getDate() + step[event.key]!,
      ),
    );
  };

  return (
    <div className="p-3">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() =>
            setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
          }
          className="grid size-9 place-items-center rounded-lg border border-(--border) text-(--text) hover:bg-(--hover) focus-visible:outline-2 focus-visible:outline-(--accent)"
        >
          <CaretLeft size={14} weight="bold" aria-hidden="true" />
        </button>
        <p className="m-0 text-sm font-bold text-(--text)" aria-live="polite">
          {MONTH.format(month)}
        </p>
        <button
          type="button"
          aria-label="Next month"
          disabled={!canGoNext}
          onClick={() => setMonth(nextMonthStart)}
          className="grid size-9 place-items-center rounded-lg border border-(--border) text-(--text) hover:bg-(--hover) disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-(--accent)"
        >
          <CaretRight size={14} weight="bold" aria-hidden="true" />
        </button>
      </div>

      <div
        ref={gridRef}
        role="grid"
        aria-label={MONTH.format(month)}
        onKeyDown={onKeyDown}
        className="grid grid-cols-7 gap-y-1"
      >
        {WEEKDAYS.map((day) => (
          <span
            key={day}
            role="columnheader"
            className="pb-1 text-center text-[0.6875rem] font-semibold text-(--muted)"
          >
            {day}
          </span>
        ))}
        {cells.map((day, index) => {
          if (!day) return <span key={`blank-${index}`} aria-hidden="true" />;
          const future = day > todayStart;
          const isStart = sameDay(day, from);
          const isEnd = sameDay(day, to);
          const inRange = Boolean(from && to && day >= from && day <= to);
          const isToday = sameDay(day, todayStart);
          const tabbable = sameDay(day, focused);
          return (
            <button
              key={toDayKey(day)}
              type="button"
              role="gridcell"
              data-day={toDayKey(day)}
              tabIndex={tabbable ? 0 : -1}
              disabled={future}
              aria-selected={inRange || isStart}
              aria-label={DAY_LABEL.format(day)}
              onClick={() => pick(day)}
              onFocus={() => setFocused(day)}
              className={[
                "mx-auto grid h-9 w-full max-w-10 place-items-center text-sm tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-(--accent)",
                future
                  ? "cursor-not-allowed text-(--muted) opacity-40"
                  : "text-(--text) hover:bg-(--hover)",
                inRange
                  ? "bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]"
                  : "",
                isStart || isEnd
                  ? "rounded-lg bg-(--accent)! font-bold text-(--on-accent)!"
                  : "",
                inRange && !isStart && !isEnd ? "rounded-none" : "rounded-lg",
                isToday && !isStart && !isEnd
                  ? "ring-1 ring-(--text)/50 ring-inset"
                  : "",
              ].join(" ")}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
