import { CaretLeftIcon as CaretLeft } from "@phosphor-icons/react/CaretLeft";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/CaretRight";
import type { LearningHistoryDay } from "@veolms/contracts";
import { GoalRing } from "./GoalRing";
import {
  addMonths,
  dayOfMonth,
  formatDay,
  formatMonth,
  monthOf,
  monthWeeks,
} from "./progressDates";
import {
  dayStanding,
  describeStanding,
  formatDuration,
  goalShare,
  standingDiscClasses,
} from "./progressFormat";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const monthButtonClasses =
  "inline-flex size-8 cursor-pointer items-center justify-center rounded-lg text-(--muted) transition-colors hover:bg-(--text)/6 hover:text-(--text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-(--muted)";

const dayButtonClasses =
  "relative mx-auto grid size-9 cursor-pointer place-items-center rounded-full text-xs font-semibold tabular-nums transition-[background-color,box-shadow] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) disabled:cursor-default sm:size-10 sm:text-[0.8rem]";

/** Today's mark: a dot under its number, in whatever the number is written in. */
function TodayDot() {
  return (
    <span
      aria-hidden="true"
      className="absolute bottom-1.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-current"
    />
  );
}

/**
 * A month, a circle for each day. A day with nothing is only its number;
 * a day of learning wears a ring as far round as its goal was reached; a
 * day whose goal was met is filled, in green when it was passed. A day
 * that was missed is not marked.
 */
export function ProgressCalendar({
  month,
  today,
  dayByDate,
  selectedDate,
  loading,
  onSelectDate,
  onChangeMonth,
}: {
  /** `YYYY-MM`. */
  month: string;
  today: string;
  dayByDate: ReadonlyMap<string, LearningHistoryDay>;
  selectedDate: string | null;
  /** The month's days are still being fetched. */
  loading: boolean;
  onSelectDate: (date: string) => void;
  onChangeMonth: (month: string) => void;
}) {
  const isCurrentMonth = month >= monthOf(today);
  return (
    <div aria-busy={loading}>
      <div className="flex items-center justify-between gap-3">
        <h2
          id="progress-calendar-title"
          className="text-base font-semibold text-(--text)"
        >
          {formatMonth(month)}
        </h2>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            className={monthButtonClasses}
            onClick={() => onChangeMonth(addMonths(month, -1))}
            aria-label={`Show ${formatMonth(addMonths(month, -1))}`}
          >
            <CaretLeft size={16} weight="bold" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={monthButtonClasses}
            onClick={() => onChangeMonth(addMonths(month, 1))}
            disabled={isCurrentMonth}
            aria-label={`Show ${formatMonth(addMonths(month, 1))}`}
          >
            <CaretRight size={16} weight="bold" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div
        aria-hidden="true"
        className="mt-4 grid grid-cols-7 gap-1 text-center text-[0.66rem] font-semibold tracking-wide text-(--muted) sm:gap-1.5"
      >
        {WEEKDAYS.map((weekday) => (
          <span key={weekday}>{weekday}</span>
        ))}
      </div>
      <div
        className={`mt-2 grid grid-cols-7 gap-1 sm:gap-1.5 ${
          loading ? "opacity-60" : ""
        }`}
      >
        {monthWeeks(month)
          .flat()
          .map((date, index) => {
            if (!date) return <span key={`blank-${index}`} />;
            const day = dayByDate.get(date);
            const future = date > today;
            const isToday = date === today;
            const standing = future ? "none" : dayStanding(day);
            const selected = date === selectedDate;
            const selection = selected
              ? "shadow-[0_0_0_2px_var(--elevated-card),0_0_0_4px_var(--accent)]"
              : "";
            const number = dayOfMonth(date);

            const content =
              standing === "under" ? (
                <GoalRing
                  share={goalShare(day!.seconds, day!.goalMinutes)}
                  stroke={4.4}
                  animate={false}
                  className="size-full text-(--text)"
                >
                  <span className="relative">{number}</span>
                </GoalRing>
              ) : (
                number
              );

            return (
              <button
                key={date}
                type="button"
                disabled={future}
                onClick={() => onSelectDate(date)}
                aria-pressed={selected}
                aria-current={isToday ? "date" : undefined}
                aria-label={
                  future
                    ? formatDay(date)
                    : `${formatDay(date)}: ${formatDuration(day?.seconds ?? 0)}. ${describeStanding(day)}`
                }
                className={`${dayButtonClasses} ${selection} ${
                  standing === "completed" || standing === "beyond"
                    ? standingDiscClasses[standing]
                    : standing === "under"
                      ? "text-(--text)"
                      : future
                        ? "text-(--muted)/40"
                        : isToday
                          ? "text-(--text) hover:bg-(--text)/6"
                          : "text-(--muted) hover:bg-(--text)/6"
                }`}
              >
                {content}
                {isToday ? <TodayDot /> : null}
              </button>
            );
          })}
      </div>

      <ul
        aria-label="How the days are marked"
        className="mt-5 flex flex-wrap gap-x-5 gap-y-1.5 text-[0.72rem] text-(--muted)"
      >
        <li className="flex items-center gap-2">
          <GoalRing
            share={0.55}
            stroke={6}
            animate={false}
            className="size-3.5"
          />
          Studied
        </li>
        <li className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={`size-3.5 rounded-full ${standingDiscClasses.completed}`}
          />
          Goal met
        </li>
        <li className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={`size-3.5 rounded-full ${standingDiscClasses.beyond}`}
          />
          Extra time
        </li>
      </ul>
    </div>
  );
}
