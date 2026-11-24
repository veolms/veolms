import { useMemo } from "react";
import { FireIcon as Fire } from "@phosphor-icons/react/Fire";
import type { CodingPracticeStats } from "@veolms/contracts";
import { ElevatedCard } from "../components/ElevatedCard";
import { ProgressRing } from "../components/ProgressRing";
import { CODE_TONES } from "../coding-practice/shared/ui";

const DIFFICULTIES = [
  ["easy", "Easy", "stroke-(--code-pass)", "text-(--code-pass)"],
  ["medium", "Medium", "stroke-(--code-warn)", "text-(--code-warn)"],
  ["hard", "Hard", "stroke-(--code-fail)", "text-(--code-fail)"],
] as const;

/** Solved out of what can be opened, overall and by difficulty. */
export function SolvedCard({ stats }: { stats: CodingPracticeStats }) {
  const solved = stats.solved.easy + stats.solved.medium + stats.solved.hard;
  const total =
    stats.available.easy + stats.available.medium + stats.available.hard;
  return (
    <ElevatedCard
      padded
      className={`flex flex-wrap items-center gap-5 ${CODE_TONES}`}
    >
      <ProgressRing
        share={total ? solved / total : 0}
        stroke={4}
        className="size-24 shrink-0"
      >
        <span className="grid text-center leading-tight">
          <span className="text-xl font-bold text-(--text) tabular-nums">
            {solved}
            <span className="text-sm font-medium text-(--muted)">/{total}</span>
          </span>
          <span className="text-[0.6875rem] text-(--muted)">Solved</span>
        </span>
      </ProgressRing>
      <ul className="grid min-w-40 flex-1 gap-2">
        {DIFFICULTIES.map(([key, label, , tone]) => {
          const done = stats.solved[key];
          const of = stats.available[key];
          return (
            <li key={key} className="grid gap-1">
              <span className="flex items-center justify-between text-sm">
                <span className={`font-semibold ${tone}`}>{label}</span>
                <span className="text-(--text-secondary) tabular-nums">
                  {done}
                  <span className="text-(--muted)">/{of}</span>
                </span>
              </span>
              <span className="h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                <span
                  className={`block h-full rounded-full bg-current ${tone}`}
                  style={{
                    width: `${of ? Math.round((done / of) * 100) : 0}%`,
                  }}
                />
              </span>
            </li>
          );
        })}
      </ul>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm max-sm:w-full">
        <dt className="text-(--muted)">Attempted</dt>
        <dd className="text-right font-semibold text-(--text) tabular-nums">
          {stats.attempted}
        </dd>
        <dt className="text-(--muted)">Submissions</dt>
        <dd className="text-right font-semibold text-(--text) tabular-nums">
          {stats.submissions}
        </dd>
        <dt className="text-(--muted)">Coding time</dt>
        <dd className="text-right font-semibold text-(--text) tabular-nums">
          {stats.activeMinutes >= 60
            ? `${Math.floor(stats.activeMinutes / 60)} h ${stats.activeMinutes % 60} min`
            : `${stats.activeMinutes} min`}
        </dd>
      </dl>
    </ElevatedCard>
  );
}

const DAY_MS = 86_400_000;
const WEEKS = 53;

/** The learner's local date as YYYY-MM-DD. */
function todayIn(timeZone: string) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/**
 * A year of practice, a square a day (Sunday at the top), darker for more
 * submits, with the streak beside it.
 */
export function PracticeCalendar({ stats }: { stats: CodingPracticeStats }) {
  const { days, activeDays, monthLabels } = useMemo(() => {
    const byDate = new Map(stats.calendar.map((day) => [day.date, day]));
    const today = Date.parse(`${todayIn(stats.timeZone)}T00:00:00Z`);
    const weekday = new Date(today).getUTCDay();
    const start = today - (WEEKS * 7 - 1 - (6 - weekday)) * DAY_MS;
    const cells: {
      date: string;
      submissions: number;
      solved: number;
      future: boolean;
    }[] = [];
    const labels: { index: number; label: string }[] = [];
    for (let index = 0; index < WEEKS * 7; index += 1) {
      const time = start + index * DAY_MS;
      const date = new Date(time).toISOString().slice(0, 10);
      const day = byDate.get(date);
      if (date.endsWith("-01") || index === 0) {
        const week = Math.floor(index / 7);
        if (!labels.some((entry) => entry.index === week))
          labels.push({
            index: week,
            label: new Date(time).toLocaleDateString(undefined, {
              month: "short",
              timeZone: "UTC",
            }),
          });
      }
      cells.push({
        date,
        submissions: day?.submissions ?? 0,
        solved: day?.solved ?? 0,
        future: time > today,
      });
    }
    return {
      days: cells,
      activeDays: stats.calendar.length,
      monthLabels: labels.filter(
        (entry, at, all) => at === 0 || entry.index - all[at - 1]!.index > 2,
      ),
    };
  }, [stats.calendar, stats.timeZone]);

  const tone = (count: number) =>
    count === 0
      ? "bg-[color-mix(in_srgb,var(--text)_7%,transparent)]"
      : count < 3
        ? "bg-[color-mix(in_srgb,var(--code-pass)_35%,transparent)]"
        : count < 6
          ? "bg-[color-mix(in_srgb,var(--code-pass)_60%,transparent)]"
          : "bg-(--code-pass)";

  return (
    <ElevatedCard padded className={`grid gap-4 ${CODE_TONES}`}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <p className="text-sm text-(--text-secondary)">
          <b className="text-(--text) tabular-nums">{stats.submissions}</b>{" "}
          submissions in the past year ·{" "}
          <b className="text-(--text) tabular-nums">{activeDays}</b> active days
        </p>
        <p className="ml-auto inline-flex items-center gap-1.5 text-sm">
          <Fire
            size={18}
            weight="fill"
            aria-hidden="true"
            className={
              stats.streak.current ? "text-orange-500" : "text-(--muted)"
            }
          />
          <b className="text-(--text) tabular-nums">{stats.streak.current}</b>
          <span className="text-(--muted)">
            day streak · best {stats.streak.best}
          </span>
        </p>
      </div>
      <div className="overflow-x-auto pb-1 [scrollbar-width:thin]">
        <div className="relative w-max pt-5">
          {monthLabels.map((entry) => (
            <span
              key={entry.index}
              className="absolute top-0 text-[0.6875rem] text-(--muted)"
              style={{ left: `${entry.index * 14}px` }}
            >
              {entry.label}
            </span>
          ))}
          <ol
            aria-label="Practice in the past year"
            className="grid grid-flow-col grid-rows-7 gap-0.5"
          >
            {days.map((day) => (
              <li
                key={day.date}
                title={
                  day.future
                    ? undefined
                    : `${day.submissions} submission${day.submissions === 1 ? "" : "s"}${day.solved ? `, ${day.solved} solved` : ""} on ${day.date}`
                }
                className={`size-3 rounded-[3px] ${day.future ? "opacity-0" : tone(day.submissions)}`}
              />
            ))}
          </ol>
        </div>
      </div>
    </ElevatedCard>
  );
}
