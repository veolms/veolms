import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { CalendarCheckIcon as CalendarCheck } from "@phosphor-icons/react/CalendarCheck";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { FireIcon as Fire } from "@phosphor-icons/react/Fire";
import { PlayCircleIcon as PlayCircle } from "@phosphor-icons/react/PlayCircle";
import { TargetIcon as Target } from "@phosphor-icons/react/Target";
import type { LearningSummaryResponse } from "@veolms/contracts";
import type { ReactNode } from "react";
import {
  formatDayCount,
  formatLearnedTime,
  formatTimeToGo,
  formatTodayAgainstGoal,
  formatWeekAgainstTarget,
  shareOf,
} from "./learnerGoalFormat";

/**
 * The laptop's screen is laid out at 800 by 530 and then drawn far smaller
 * (see `HeroLaptopScreen`), so every size here is in that screen's own
 * pixels and looks oversized in the source.
 *
 * How much smaller depends on the hero. Beside the copy (a page 50rem or
 * wider) the laptop is drawn at about half size and has room for detail.
 * In the band a narrower page gives the picture, down to a phone, it is
 * drawn at about a quarter: there the screen keeps to a few large lines.
 *
 * The screen is always a dark one, whatever the theme, so its accent is the
 * theme's accent held to a lightness that reads on it (several day palettes
 * have an accent that is nearly black).
 */
const screenClasses = [
  "relative flex size-full flex-col bg-[#080d1b] p-9 text-white @[50rem]/home:p-11",
  "bg-[radial-gradient(85%_75%_at_10%_0%,color-mix(in_srgb,var(--goal-accent)_24%,transparent),transparent_72%)]",
  "[--goal-accent:color-mix(in_srgb,var(--accent)_60%,white)]",
  "supports-[color:oklch(from_white_l_c_h)]:[--goal-accent:oklch(from_var(--accent)_max(l,0.76)_c_h)]",
].join(" ");

const RING_RADIUS = 50;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/** Today's share of the goal as a ring, with what it stands for inside. */
function GoalRing({
  percent,
  children,
}: {
  percent: number;
  children: ReactNode;
}) {
  return (
    <div className="relative size-50 shrink-0 @[50rem]/home:size-55">
      <svg viewBox="0 0 120 120" aria-hidden="true" className="size-full">
        <circle
          cx="60"
          cy="60"
          r={RING_RADIUS}
          fill="none"
          strokeWidth="11"
          className="stroke-white/12"
        />
        <circle
          cx="60"
          cy="60"
          r={RING_RADIUS}
          fill="none"
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={RING_LENGTH}
          strokeDashoffset={RING_LENGTH * (1 - percent / 100)}
          transform="rotate(-90 60 60)"
          className={`stroke-(--goal-accent) transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none ${
            percent > 0 ? "" : "opacity-0"
          }`}
        />
      </svg>
      <div className="absolute inset-0 grid place-content-center justify-items-center text-center">
        {children}
      </div>
    </div>
  );
}

/** A figure with its name, and how far along it is when that is known. */
function GoalFigure({
  icon,
  label,
  value,
  note,
  share,
  barClassName,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  /** A second, quieter figure beside the value. */
  note?: string;
  /** 0 to 100; the figure has no bar without it. */
  share?: number;
  barClassName: string;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-6 @[50rem]/home:block @[50rem]/home:rounded-[22px] @[50rem]/home:bg-white/6 @[50rem]/home:px-6 @[50rem]/home:py-5 @[50rem]/home:shadow-[inset_0_0_0_2px_rgb(255_255_255/0.07)]">
      <p className="flex min-w-0 items-center gap-3.5 text-[42px] leading-none font-medium text-slate-300 @[50rem]/home:gap-3 @[50rem]/home:text-[26px]">
        {icon}
        <span className="truncate">{label}</span>
      </p>
      <p className="flex shrink-0 items-baseline gap-3 text-[44px] leading-none font-bold tracking-[-0.02em] whitespace-nowrap @[50rem]/home:mt-4 @[50rem]/home:text-[38px]">
        {value}
        {note ? (
          <span className="hidden text-[24px] font-medium tracking-normal text-slate-400 @[50rem]/home:inline">
            {note}
          </span>
        ) : null}
      </p>
      {share === undefined ? null : (
        <span className="mt-4 hidden h-2.5 overflow-hidden rounded-full bg-white/12 @[50rem]/home:block">
          <span
            className={`block h-full rounded-full ${barClassName}`}
            style={{ width: `${share}%` }}
          />
        </span>
      )}
    </div>
  );
}

const figureIconClasses = "size-11 shrink-0 @[50rem]/home:size-8";

/**
 * What the laptop in the learner's hero shows: today's learning against
 * their daily goal, this week's, and their streak. A learner without a goal
 * sees what they have done and is offered to set one.
 */
export function LearnerGoalScreen({
  summary,
  isLoading,
  onSetGoal,
}: {
  summary: LearningSummaryResponse | undefined;
  isLoading: boolean;
  onSetGoal: () => void;
}) {
  if (!summary) {
    return (
      <div className={screenClasses}>
        <div
          role="status"
          aria-busy={isLoading}
          className="grid flex-1 place-content-center justify-items-center gap-6 text-center"
        >
          {isLoading ? (
            <>
              <span className="size-40 animate-pulse rounded-full bg-white/10 motion-reduce:animate-none" />
              <span className="sr-only">Loading your learning goals</span>
            </>
          ) : (
            <>
              <Target aria-hidden="true" className="size-28 text-slate-500" />
              <p className="grid gap-3 leading-none">
                <strong className="text-[46px] font-semibold @[50rem]/home:text-[34px]">
                  Learning goals
                </strong>
                <span className="text-[38px] text-slate-400 @[50rem]/home:text-[27px]">
                  Unavailable right now
                </span>
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  const goalMinutes = summary.configured ? summary.dailyGoalMinutes : null;
  const hasGoal = goalMinutes !== null;
  const startedToday = summary.todaySeconds > 0;

  return (
    <div
      role="group"
      aria-label="Your learning goals"
      className={screenClasses}
    >
      <div className="flex min-h-0 flex-1 items-center gap-8 @[50rem]/home:gap-10">
        <GoalRing percent={hasGoal ? summary.todayPct : 0}>
          {hasGoal ? (
            <>
              <strong className="text-[52px] leading-none font-bold tracking-[-0.03em] @[50rem]/home:text-[54px]">
                {summary.todayPct}%
              </strong>
              <span className="mt-2 hidden text-[21px] font-medium text-slate-400 @[50rem]/home:block">
                of today&apos;s goal
              </span>
            </>
          ) : (
            <Target
              aria-hidden="true"
              className="size-22 text-(--goal-accent)"
            />
          )}
        </GoalRing>

        <div className="min-w-0 flex-1">
          <p className="text-[40px] leading-none font-medium text-slate-300 @[50rem]/home:text-[30px]">
            {hasGoal ? "Today’s goal" : "Learned today"}
          </p>
          <p className="mt-4 text-[72px] leading-none font-bold tracking-[-0.03em] whitespace-nowrap @[50rem]/home:text-[62px]">
            {hasGoal
              ? formatTodayAgainstGoal(summary.todaySeconds, goalMinutes)
              : formatLearnedTime(summary.todaySeconds)}
          </p>
          {hasGoal ? (
            <p
              className={`mt-5 flex items-center gap-3 text-[38px] leading-none font-medium whitespace-nowrap @[50rem]/home:gap-2.5 @[50rem]/home:text-[28px] ${
                summary.goalCompletedToday
                  ? "text-emerald-400"
                  : "text-slate-200"
              }`}
            >
              {summary.goalCompletedToday ? (
                <CheckCircle
                  weight="fill"
                  aria-hidden="true"
                  className="size-10 shrink-0 @[50rem]/home:size-8"
                />
              ) : (
                <PlayCircle
                  weight="fill"
                  aria-hidden="true"
                  className="size-10 shrink-0 text-(--goal-accent) @[50rem]/home:size-8"
                />
              )}
              {summary.goalCompletedToday
                ? "Goal reached"
                : startedToday
                  ? formatTimeToGo(summary.remainingSeconds)
                  : "Start today’s session"}
            </p>
          ) : (
            <button
              type="button"
              onClick={onSetGoal}
              // The whole screen takes the press (the `after` layer): drawn
              // on a phone, the button alone is too small a target. The
              // shell sizes every button's text, hence the `!`.
              className="mt-6 inline-flex h-20 cursor-pointer items-center gap-3 rounded-full bg-(--goal-accent) px-9 text-[38px]! leading-none font-bold whitespace-nowrap text-slate-950 transition-[filter] duration-150 after:absolute after:inset-0 hover:brightness-110 focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-white @[50rem]/home:mt-5 @[50rem]/home:h-15 @[50rem]/home:px-7 @[50rem]/home:text-[26px]!"
            >
              Set a daily goal
              <ArrowRight
                weight="bold"
                aria-hidden="true"
                className="size-9 @[50rem]/home:size-6.5"
              />
            </button>
          )}
        </div>
      </div>

      <div className="mt-7 grid gap-6 border-t-2 border-white/10 pt-7 @[50rem]/home:mt-8 @[50rem]/home:grid-cols-2 @[50rem]/home:border-0 @[50rem]/home:pt-0">
        <GoalFigure
          icon={
            <CalendarCheck
              weight="fill"
              aria-hidden="true"
              className={`${figureIconClasses} text-(--goal-accent)`}
            />
          }
          label="This week"
          value={
            hasGoal
              ? formatWeekAgainstTarget(
                  summary.weekSeconds,
                  summary.weekTargetSeconds,
                )
              : formatLearnedTime(summary.weekSeconds)
          }
          share={
            hasGoal
              ? shareOf(summary.weekSeconds, summary.weekTargetSeconds)
              : undefined
          }
          barClassName="bg-(--goal-accent)"
        />
        <GoalFigure
          icon={
            <Fire
              weight="fill"
              aria-hidden="true"
              className={`${figureIconClasses} text-amber-400`}
            />
          }
          label="Streak"
          value={formatDayCount(summary.currentStreakDays)}
          note={
            summary.bestStreakDays > 0
              ? `Best ${summary.bestStreakDays}`
              : undefined
          }
          share={shareOf(summary.currentStreakDays, summary.bestStreakDays)}
          barClassName="bg-amber-400"
        />
      </div>
    </div>
  );
}
