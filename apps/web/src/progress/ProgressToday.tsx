import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { ConfettiIcon as Confetti } from "@phosphor-icons/react/Confetti";
import type { LearningHistoryDay } from "@veolms/contracts";
import { GoalRing } from "./GoalRing";
import {
  dayStanding,
  eyebrowClasses,
  formatDuration,
  formatGoal,
  formatLessons,
  goalShare,
} from "./progressFormat";

/**
 * Today against its goal: a ring with the time in it, and beside it what
 * the day has come to, in a line.
 */
export function ProgressToday({
  day,
  goalMinutes,
  isOwn,
}: {
  day: LearningHistoryDay | undefined;
  /** The goal of a day without a record: the learner's goal now. */
  goalMinutes: number;
  isOwn: boolean;
}) {
  const seconds = day?.seconds ?? 0;
  const completions = day?.completions ?? 0;
  const goal = day?.goalMinutes ?? goalMinutes;
  const standing = dayStanding(day);
  const share = goalShare(seconds, goal);

  const headline =
    standing === "none"
      ? isOwn
        ? "Nothing yet today"
        : "Nothing recorded today"
      : standing === "under"
        ? `${formatDuration(goal * 60 - seconds)} to go`
        : standing === "completed"
          ? "Goal completed"
          : "Awesome work";
  const detail =
    standing === "beyond"
      ? `${formatDuration(seconds - goal * 60)} past the ${formatGoal(goal)} goal`
      : completions > 0
        ? `${formatLessons(completions)} finished`
        : standing === "none" && isOwn
          ? "Open a lesson to start the day."
          : `Daily goal ${formatGoal(goal)}`;

  return (
    <div className="flex items-center gap-5 sm:gap-6">
      <GoalRing
        share={share}
        stroke={4.4}
        tone={standing === "beyond" ? "beyond" : "accent"}
        className="size-32 shrink-0 sm:size-36"
      >
        <span
          role="img"
          aria-label={`${formatDuration(seconds)} of the ${formatGoal(goal)} goal today`}
          className="relative text-center"
        >
          <span className="block text-[1.45rem] leading-none font-bold tracking-tight text-(--text) tabular-nums sm:text-[1.6rem]">
            {formatDuration(seconds)}
          </span>
          <span className="mt-1.5 block text-[0.68rem] font-semibold text-(--muted)">
            of {formatGoal(goal)}
          </span>
        </span>
      </GoalRing>

      <div className="min-w-0">
        <p className={eyebrowClasses}>Today</p>
        <p className="mt-1.5 flex items-center gap-1.5 text-lg leading-tight font-semibold text-(--text) sm:text-xl">
          {standing === "completed" ? (
            <CheckCircle
              size={20}
              weight="fill"
              aria-hidden="true"
              className="shrink-0 text-(--accent)"
            />
          ) : standing === "beyond" ? (
            <Confetti
              size={20}
              weight="fill"
              aria-hidden="true"
              className="shrink-0 text-emerald-500"
            />
          ) : null}
          <span className="min-w-0">{headline}</span>
        </p>
        <p className="mt-1 text-sm leading-5 text-(--muted)">{detail}</p>
      </div>
    </div>
  );
}
