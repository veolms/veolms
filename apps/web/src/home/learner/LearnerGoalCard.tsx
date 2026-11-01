import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { ClockIcon as Clock } from "@phosphor-icons/react/Clock";
import { ConfettiIcon as Confetti } from "@phosphor-icons/react/Confetti";
import { HandsClappingIcon as HandsClapping } from "@phosphor-icons/react/HandsClapping";
import { LightningIcon as Lightning } from "@phosphor-icons/react/Lightning";
import { TargetIcon as Target } from "@phosphor-icons/react/Target";
import type { LearningSummaryResponse } from "@veolms/contracts";
import { DEFAULT_DAILY_GOAL_MINUTES } from "@veolms/contracts/learning-goal-defaults";
import type { ReactNode } from "react";
import {
  describeGoalDay,
  timeLeftParts,
  timeOverGoalParts,
} from "./learnerGoalFormat";
import { GoalEditorForm, GoalSaveButton } from "./GoalEditorForm";
import { resumePaneClasses } from "./learnerHeroLayout";
import { useGoalEditor } from "./useGoalEditor";

/**
 * The light of the hero's glow (see `phoneBackdropClasses`), which comes
 * from the top right corner, falling on the card: its top right edge
 * catches it as a soft rim, and a faint wash of it lies just inside. Both
 * are in the theme's accent, kept very soft, and fainter by day.
 */
const cornerLightClasses = [
  "[--glow:var(--accent)] supports-[color:oklch(from_white_l_c_h)]:[--glow:oklch(from_var(--accent)_max(l,0.7)_c_h)]",
  "before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-[radial-gradient(70%_90%_at_100%_0%,color-mix(in_srgb,var(--glow)_8%,transparent),transparent_70%)]",
  "after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:p-px after:bg-[radial-gradient(55%_75%_at_100%_0%,color-mix(in_srgb,var(--glow)_32%,transparent),color-mix(in_srgb,var(--glow)_10%,transparent)_45%,transparent_75%)] after:[mask:linear-gradient(#000_0_0)_content-box_exclude,linear-gradient(#000_0_0)]",
  // It follows the lamp, as the glow does (see `phoneBackdropClasses`).
  "before:transition-opacity before:duration-300 after:transition-opacity after:duration-300 motion-reduce:before:transition-none motion-reduce:after:transition-none",
  "[[data-lamp=off]_&]:before:opacity-0 [[data-lamp=off]_&]:after:opacity-0",
  "[:root[data-theme=light]_&]:[--glow:var(--accent)] [:root[data-theme=light]_&]:before:opacity-0 [:root[data-theme=light]_&]:after:opacity-0 [:root[data-theme=light]_[data-lamp=on]_&]:before:opacity-60 [:root[data-theme=light]_[data-lamp=on]_&]:after:opacity-50",
].join(" ");

/**
 * The goal card's own room. It is drawn on the same frosted surface as the
 * course's card under it, and stands in for the laptop's screen, which a
 * phone does not show (see `pictureBandClasses`).
 */
export const goalCardClasses = `${resumePaneClasses} ${cornerLightClasses} w-full p-4 sm:hidden`;

const pulse = "animate-pulse motion-reduce:animate-none";
const placeholder = `${pulse} block rounded-md bg-current/14`;

/**
 * One of the three figures along the card's foot. They stand in a line,
 * each after a dot, rather than in pills of their own.
 */
function GoalChip({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <p className="flex shrink-0 items-center gap-1.5 text-xs last:min-w-0 last:shrink leading-5 whitespace-nowrap text-(--text) not-first:before:mr-1 not-first:before:font-bold not-first:before:text-(--muted) not-first:before:content-['·'] min-[390px]:text-[0.8125rem]">
      {icon}
      <span className="truncate">{children}</span>
    </p>
  );
}

const chipIconClasses = "size-4 shrink-0";

/**
 * Today's learning against the daily goal, as a card in a phone's hero:
 * the minutes, a bar in the theme's accent, and three figures under it
 * (lessons finished today, the time left, the share done). It says the
 * same as the laptop's screen does on wider pages (see `LearnerGoalScreen`),
 * meeting and passing the goal included. The target in its corner opens
 * the goal for editing in place of its title and figures, and becomes the
 * tick that saves it (see `useGoalEditor`).
 */
export function LearnerGoalCard({
  summary,
  isLoading,
}: {
  summary: LearningSummaryResponse | undefined;
  isLoading: boolean;
}) {
  // An API that predates the default goal answers with none.
  const goalMinutes = summary?.dailyGoalMinutes ?? DEFAULT_DAILY_GOAL_MINUTES;
  const editor = useGoalEditor(goalMinutes);
  if (!summary) {
    return isLoading ? (
      <LearnerGoalCardSkeleton />
    ) : (
      <section aria-label="Today's goal" className={goalCardClasses}>
        <p className="text-[0.9375rem] font-medium">Today&apos;s goal</p>
        <p className="mt-1 text-sm text-(--muted)">Unavailable right now.</p>
      </section>
    );
  }

  const { today, percent, standing, barShare } = describeGoalDay(
    summary.todaySeconds,
    goalMinutes,
  );
  const beyond = standing === "beyond";
  // Not sent by an API that predates it; the figure is then left out.
  const lessons: number | undefined = summary.todayCompletions;
  const outcome = beyond
    ? timeOverGoalParts(summary.todaySeconds, goalMinutes)
    : standing === "under"
      ? timeLeftParts(summary.todaySeconds, goalMinutes)
      : { amount: "0", label: "min left" };

  return (
    <section
      aria-labelledby="learner-goal-card-title"
      className={goalCardClasses}
    >
      <div className="relative z-10">
        <div className="flex items-start justify-between gap-3">
          <div className={editor.editing ? "min-w-0 flex-1" : "min-w-0"}>
            {/* Still the card's name while the editor's line stands in its
                place. */}
            <h2
              id="learner-goal-card-title"
              hidden={editor.editing}
              className="flex items-center gap-2 text-[0.9375rem] leading-5 font-medium"
            >
              {standing === "under" ? "Today's goal" : null}
              {standing === "completed" ? (
                <>
                  Today&apos;s goal completed
                  <HandsClapping
                    weight="fill"
                    aria-hidden="true"
                    className="size-5 text-amber-400"
                  />
                </>
              ) : null}
              {beyond ? (
                <>
                  Awesome work today!
                  <Confetti
                    weight="fill"
                    aria-hidden="true"
                    className="size-5 text-amber-400"
                  />
                </>
              ) : null}
            </h2>
            {editor.editing ? (
              <GoalEditorForm editor={editor} variant="card" />
            ) : (
              <p className="mt-2 flex items-baseline leading-none whitespace-nowrap">
                <strong className="text-[2.75rem] font-extrabold tracking-[-0.03em]">
                  {today.done}
                </strong>
                <span className="ml-2.5 text-2xl font-semibold text-(--muted)">
                  / {today.goal} {today.unit}
                </span>
              </p>
            )}
          </div>
          {/* The tick that saves the goal takes its place while the goal
              is edited. */}
          {editor.editing ? (
            <GoalSaveButton
              editor={editor}
              className="grid size-12 shrink-0 place-items-center rounded-2xl bg-(--accent) text-(--on-accent,white) hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
              iconClassName="size-6"
            />
          ) : (
            <button
              type="button"
              onClick={editor.open}
              aria-label="Edit your daily goal"
              title="Edit your daily goal"
              className="grid size-12 shrink-0 cursor-pointer place-items-center rounded-2xl bg-current/6 text-[color-mix(in_srgb,var(--accent)_70%,white)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,currentColor_12%,transparent)] transition-colors hover:bg-current/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) [:root[data-theme=light]_&]:text-(--accent)"
            >
              <Target size={24} weight="bold" aria-hidden="true" />
            </button>
          )}
        </div>

        <div
          role="progressbar"
          aria-label="Today's goal"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(100, percent)}
          aria-valuetext={`${today.done} of ${today.goal} ${today.unit}`}
          className="mt-4 flex h-2.5 gap-1 overflow-hidden rounded-full bg-current/10"
        >
          <span
            style={{ width: `${barShare}%` }}
            // Past the goal the two parts are each rounded at both ends,
            // with the track between them; the glow would fill that space.
            className={`h-full shrink-0 rounded-full bg-[linear-gradient(90deg,color-mix(in_srgb,var(--accent)_55%,white),color-mix(in_srgb,var(--accent)_85%,white))] transition-[width] duration-700 ease-out motion-reduce:transition-none [:root[data-theme=light]_&]:bg-[linear-gradient(90deg,color-mix(in_srgb,var(--accent)_70%,white),var(--accent))] ${
              beyond
                ? ""
                : "shadow-[0_0_14px_color-mix(in_srgb,var(--accent)_50%,transparent)]"
            }`}
          />
          {beyond ? (
            <span className="h-full min-w-0 flex-1 rounded-full bg-[linear-gradient(90deg,#4ade80,#86efac)]" />
          ) : null}
        </div>

        {/* Always on one line: a figure wrapped onto a line of its own would
            start that line with its dot. On the narrowest screens the last
            one gives up its end instead. */}
        <div className="mt-4 flex min-w-0 items-center gap-x-2 min-[390px]:gap-x-2.5">
          {typeof lessons === "number" ? (
            <GoalChip
              icon={
                <BookOpen
                  weight="fill"
                  aria-hidden="true"
                  // The same blue in every theme, beside the amber and
                  // green of the other two.
                  className={`${chipIconClasses} text-[#5b82ff]`}
                />
              }
            >
              {lessons} {lessons === 1 ? "lesson" : "lessons"}
            </GoalChip>
          ) : null}
          <GoalChip
            icon={
              beyond ? (
                <Lightning
                  weight="fill"
                  aria-hidden="true"
                  className={`${chipIconClasses} text-amber-400`}
                />
              ) : (
                <Clock
                  weight="fill"
                  aria-hidden="true"
                  className={`${chipIconClasses} text-amber-400`}
                />
              )
            }
          >
            {outcome.amount} {outcome.label}
          </GoalChip>
          <GoalChip
            icon={
              <CheckCircle
                weight="fill"
                aria-hidden="true"
                className={`${chipIconClasses} text-emerald-500`}
              />
            }
          >
            {beyond ? percent : Math.min(100, percent)}%{" "}
            {beyond ? "of goal" : "complete"}
          </GoalChip>
        </div>
      </div>
    </section>
  );
}

/**
 * The goal card before the learner's summary has arrived, the card's own
 * height so nothing under it moves when it does.
 */
export function LearnerGoalCardSkeleton() {
  return (
    <div aria-hidden="true" className={goalCardClasses}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <span className={`${placeholder} mt-0.5 h-4 w-28`} />
          <span className={`${placeholder} mt-3.5 h-10 w-40`} />
        </div>
        <span className={`${placeholder} size-12 rounded-2xl`} />
      </div>
      <span className={`${placeholder} mt-4 h-2.5 rounded-full`} />
      <div className="mt-4 flex h-5 items-center gap-4">
        <span className={`${placeholder} h-3.5 w-20`} />
        <span className={`${placeholder} h-3.5 w-22`} />
        <span className={`${placeholder} h-3.5 w-26`} />
      </div>
    </div>
  );
}
