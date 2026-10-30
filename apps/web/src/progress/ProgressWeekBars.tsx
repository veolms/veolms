import type { LearningHistoryDay } from "@veolms/contracts";
import { formatDay, formatWeekday } from "./progressDates";
import {
  dayStanding,
  describeStanding,
  eyebrowClasses,
  formatDuration,
  standingBarClasses,
} from "./progressFormat";

/**
 * The last seven days as bars against the goal. A bar that passes its goal
 * is drawn in two parts, the goal and then the extra in green, as the
 * laptop on the learner's home draws today's. Choosing a bar shows that
 * day below.
 */
export function ProgressWeekBars({
  dates,
  today,
  dayByDate,
  goalMinutes,
  selectedDate,
  onSelectDate,
  className = "",
}: {
  /** The seven days, oldest first. */
  dates: readonly string[];
  today: string;
  dayByDate: ReadonlyMap<string, LearningHistoryDay>;
  /** The learner's goal now: where the line is drawn. */
  goalMinutes: number;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  className?: string;
}) {
  const goalSeconds = goalMinutes * 60;
  let weekSeconds = 0;
  let goalsMet = 0;
  for (const date of dates) {
    const day = dayByDate.get(date);
    weekSeconds += day?.seconds ?? 0;
    const standing = dayStanding(day);
    if (standing === "completed" || standing === "beyond") goalsMet += 1;
  }
  // The chart is as tall as its longest day, and always tall enough for the
  // goal's line to stand clear of the top.
  const tallest = Math.max(
    goalSeconds * 1.2,
    ...dates.map((date) => dayByDate.get(date)?.seconds ?? 0),
  );
  const share = (seconds: number) => `${(seconds / tallest) * 100}%`;

  return (
    <div className={`flex min-w-0 flex-col ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className={eyebrowClasses}>This week</p>
        <p className="text-sm text-(--muted) tabular-nums">
          <strong className="font-semibold text-(--text)">
            {formatDuration(weekSeconds)}
          </strong>{" "}
          · {goalsMet} of 7 goals
        </p>
      </div>

      <div className="relative mt-4 grid h-32 grid-cols-7 gap-1.5 sm:gap-2.5">
        <span
          aria-hidden="true"
          // Measured in the bars' own height: each column keeps a line
          // above its bar for the day's time.
          style={{
            bottom: `calc((100% - 1.25rem) * ${goalSeconds / tallest})`,
          }}
          className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-(--muted)/50"
        />
        {dates.map((date) => {
          const day = dayByDate.get(date);
          const standing = dayStanding(day);
          const seconds = day?.seconds ?? 0;
          const dayGoalSeconds = (day?.goalMinutes ?? goalMinutes) * 60;
          const selected = date === selectedDate;
          return (
            <button
              key={date}
              type="button"
              onClick={() => onSelectDate(date)}
              aria-pressed={selected}
              aria-label={`${formatDay(date)}: ${formatDuration(seconds)}. ${describeStanding(day)}`}
              className={`group flex h-full min-w-0 cursor-pointer flex-col rounded-lg text-center transition-colors hover:bg-(--text)/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) ${
                selected ? "bg-(--text)/6" : ""
              }`}
            >
              <span className="flex h-5 shrink-0 items-center justify-center truncate text-[0.66rem] leading-none font-semibold text-(--muted) tabular-nums">
                {seconds >= 60 ? formatDuration(seconds) : ""}
              </span>
              <span className="flex min-h-0 flex-1 flex-col justify-end px-1">
                {standing === "beyond" ? (
                  <>
                    <span
                      style={{ height: share(seconds - dayGoalSeconds) }}
                      className={`mx-auto mb-0.5 block w-full max-w-7 shrink-0 rounded-sm ${standingBarClasses.beyond}`}
                    />
                    <span
                      style={{ height: share(dayGoalSeconds) }}
                      className={`mx-auto block w-full max-w-7 shrink-0 rounded-sm ${standingBarClasses.completed}`}
                    />
                  </>
                ) : (
                  <span
                    // A day with a few minutes still shows as a sliver.
                    style={{
                      height: share(seconds),
                      minHeight: seconds ? 3 : 0,
                    }}
                    className={`mx-auto block w-full max-w-7 shrink-0 rounded-sm ${standingBarClasses[standing]}`}
                  />
                )}
              </span>
            </button>
          );
        })}
      </div>
      <div
        aria-hidden="true"
        className="mt-2 grid grid-cols-7 gap-1.5 text-center text-[0.72rem] text-(--muted) sm:gap-2.5"
      >
        {dates.map((date) => (
          <span
            key={date}
            className={
              date === selectedDate
                ? "font-semibold text-(--text)"
                : date === today
                  ? "font-semibold"
                  : ""
            }
          >
            {formatWeekday(date)}
          </span>
        ))}
      </div>
    </div>
  );
}
