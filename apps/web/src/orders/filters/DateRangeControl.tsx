import { useState } from "react";
import { CalendarBlankIcon as CalendarBlank } from "@phosphor-icons/react/CalendarBlank";
import {
  DATE_CHIPS,
  QUICK_RANGES,
  dateRangeLabel,
  formatDayRange,
  resolveDateRange,
  type DateRangeKey,
} from "../ordersDateRange";
import { FilterDropdown } from "./FilterDropdown";
import { RangeCalendar } from "./RangeCalendar";

export interface DateRangeControlProps {
  range: DateRangeKey;
  customFrom: Date | null;
  customTo: Date | null;
  onRangeChange: (range: Exclude<DateRangeKey, "custom">) => void;
  onCustomRange: (from: Date, to: Date) => void;
}

const chipClasses =
  "inline-flex h-9 min-w-11 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent)";
const activeChip = "bg-(--accent) text-(--on-accent) shadow-sm";
const idleChip =
  "text-(--text-secondary) hover:bg-(--hover) hover:text-(--text)";

/**
 * 1D / 7D / 30D in one click, and a calendar button for the quick ranges
 * and a custom range. While the calendar is open, or a range from it is in
 * use, the calendar button is the highlighted one (with the range named)
 * and no chip is.
 */
export function DateRangeControl({
  range,
  customFrom,
  customTo,
  onRangeChange,
  onCustomRange,
}: DateRangeControlProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<{ from: Date | null; to: Date | null }>({
    from: null,
    to: null,
  });
  const today = new Date();
  const fromCalendar = !(DATE_CHIPS as readonly string[]).includes(range);
  const calendarActive = open || fromCalendar;

  const openChange = (next: boolean) => {
    if (next) {
      const current = resolveDateRange(range, today, {
        from: customFrom,
        to: customTo,
      });
      setDraft(fromCalendar ? current : { from: null, to: null });
    }
    setOpen(next);
  };

  const activeLabel =
    range === "custom"
      ? (() => {
          const { from, to } = resolveDateRange(range, today, {
            from: customFrom,
            to: customTo,
          });
          return formatDayRange(from, to);
        })()
      : fromCalendar
        ? dateRangeLabel(range)
        : null;

  return (
    <div
      role="group"
      aria-label="Date range"
      className="inline-flex max-w-full items-center gap-1 rounded-xl border border-(--border) bg-(--card-surface) p-1"
    >
      {DATE_CHIPS.map((chip) => {
        const active = !calendarActive && range === chip;
        return (
          <button
            key={chip}
            type="button"
            aria-pressed={active}
            onClick={() => onRangeChange(chip)}
            className={`${chipClasses} ${active ? activeChip : idleChip}`}
          >
            {dateRangeLabel(chip)}
          </button>
        );
      })}
      <FilterDropdown
        open={open}
        onOpenChange={openChange}
        label={activeLabel ? `Date range: ${activeLabel}` : "Pick a date range"}
        hideCaret
        align="end"
        triggerClassName={`h-9! min-w-11 justify-center border-0! px-3! ${calendarActive ? `${activeChip} hover:bg-(--accent)!` : `bg-transparent! ${idleChip}`}`}
        contentClassName="w-[min(36rem,calc(100vw-1rem))]"
        trigger={
          <>
            <CalendarBlank size={16} weight="bold" aria-hidden="true" />
            {activeLabel && (
              <span className="max-w-[11rem] truncate text-sm">
                {activeLabel}
              </span>
            )}
          </>
        }
      >
        <div className="flex flex-col sm:flex-row">
          <div className="border-b border-(--border) p-3 sm:w-44 sm:shrink-0 sm:border-r sm:border-b-0">
            <p className="m-0 mb-1 px-2 text-[0.6875rem] font-bold tracking-wider text-(--muted) uppercase">
              Quick ranges
            </p>
            <div className="flex flex-wrap gap-1 sm:flex-col">
              {QUICK_RANGES.map((quick) => (
                <button
                  key={quick}
                  type="button"
                  aria-pressed={range === quick}
                  onClick={() => {
                    onRangeChange(quick);
                    setOpen(false);
                  }}
                  className={`rounded-lg px-2.5 py-2 text-left text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-(--accent) ${range === quick ? "bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-(--accent)" : "text-(--text) hover:bg-(--hover)"}`}
                >
                  {dateRangeLabel(quick)}
                </button>
              ))}
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <RangeCalendar
              from={draft.from}
              to={draft.to}
              today={today}
              onPick={(from, to) => setDraft({ from, to })}
            />
            <div className="flex items-center gap-3 border-t border-(--border) px-4 py-3">
              <span
                className="mr-auto truncate text-xs text-(--muted)"
                aria-live="polite"
              >
                {draft.from
                  ? formatDayRange(draft.from, draft.to ?? draft.from)
                  : "Pick a start date"}
              </span>
              <button
                type="button"
                disabled={!draft.from}
                onClick={() => {
                  if (!draft.from) return;
                  onCustomRange(draft.from, draft.to ?? draft.from);
                  setOpen(false);
                }}
                className="h-9 rounded-lg bg-(--accent) px-4 text-sm font-bold text-(--on-accent) hover:opacity-90 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      </FilterDropdown>
    </div>
  );
}
