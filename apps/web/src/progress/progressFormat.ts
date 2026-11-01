import type { LearningHistoryDay } from "@veolms/contracts";
import { goalStanding, type GoalStanding } from "../services/learning-goals";

/** "45 min", "1h 20m", "2h": rounded down, never an unearned minute. */
export function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

/** "60 min", "90 min", "2h": a goal, in minutes up to two hours. */
export function formatGoal(goalMinutes: number) {
  return goalMinutes < 120
    ? `${goalMinutes} min`
    : formatDuration(goalMinutes * 60);
}

/** "1 lesson", "3 lessons". */
export function formatLessons(completions: number) {
  return `${completions} ${completions === 1 ? "lesson" : "lessons"}`;
}

/** A day with nothing recorded, or where it stands against its goal. */
export type DayStanding = GoalStanding | "none";

export function dayStanding(day: LearningHistoryDay | undefined): DayStanding {
  if (!day || (day.seconds <= 0 && day.completions <= 0)) return "none";
  return goalStanding(day.seconds, day.goalMinutes);
}

/** How much of a goal a day's time is, 0 to 1. */
export function goalShare(seconds: number, goalMinutes: number) {
  return Math.max(0, Math.min(1, seconds / (goalMinutes * 60)));
}

/**
 * One colour language for the page, the one the laptop on the learner's
 * home speaks: time short of the goal in a tint of the accent, a goal met
 * in the accent, and time past a goal in green.
 */
export const standingBarClasses: Record<DayStanding, string> = {
  none: "",
  under: "bg-(--accent)/30",
  completed: "bg-(--accent)",
  beyond: "bg-emerald-500",
};

/** A day's circle on the calendar once its goal is met. */
export const standingDiscClasses: Record<"completed" | "beyond", string> = {
  completed: "bg-(--accent) text-(--on-accent)",
  beyond: "bg-emerald-500 text-white",
};

/** What a day is called. Praise for a goal passed; no blame for one missed. */
export function describeStanding(day: LearningHistoryDay | undefined) {
  const standing = dayStanding(day);
  if (standing === "none" || !day) return "No learning recorded";
  if (standing === "under") return "Studied";
  if (standing === "completed") return "Goal completed";
  return `Awesome work, ${formatDuration(day.seconds - day.goalMinutes * 60)} extra`;
}

export interface MonthFigures {
  /** Days of the month that have come, today included. */
  daysSoFar: number;
  daysStudied: number;
  goalsCompleted: number;
  seconds: number;
  completions: number;
}

/** A month's totals from the days that have a record. */
export function monthFigures(
  days: readonly LearningHistoryDay[],
  daysSoFar: number,
): MonthFigures {
  let daysStudied = 0;
  let goalsCompleted = 0;
  let seconds = 0;
  let completions = 0;
  for (const day of days) {
    const standing = dayStanding(day);
    if (standing === "none") continue;
    daysStudied += 1;
    if (standing !== "under") goalsCompleted += 1;
    seconds += day.seconds;
    completions += day.completions;
  }
  return { daysSoFar, daysStudied, goalsCompleted, seconds, completions };
}

/** A small, quiet heading over a block: "TODAY", "THIS WEEK". */
export const eyebrowClasses =
  "text-[0.68rem] font-semibold tracking-[0.14em] text-(--muted) uppercase";

/** The faint line that parts the blocks of a card. */
export const hairlineClasses = "border-(--text)/8";
