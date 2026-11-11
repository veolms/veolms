import { goalTextFromMinutes } from "./goalInput";

/** One decimal at most, and none when it would be ".0". */
function trimmed(value: number) {
  return String(Math.round(value * 10) / 10);
}

/** Time learned so far, rounded down so it never claims an unearned minute. */
function hoursLearned(seconds: number) {
  return trimmed(Math.floor((seconds / 3600) * 10) / 10);
}

/** Minutes as hours and minutes, short: "45m", "1h 10m", "2h". */
function shortHoursAndMinutes(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

/**
 * Today's time against the daily goal, in the two parts the laptop and the
 * phone's card set in different sizes. A goal under an hour is in minutes
 * ("12", "45 min"). From an hour on the goal is written as the learner
 * types it in the editor ("1 hr 35 min", "2 hr"; see `goalTextFromMinutes`)
 * and the time done in hours and minutes ("0", "45m", "1h 10m"): it read
 * "0 / 95 min" for a goal entered as 1 hr 35 min. That line is longer, so
 * `long` tells whoever sets it to set it a size smaller.
 */
export function todayAgainstGoalParts(
  todaySeconds: number,
  goalMinutes: number,
) {
  const doneMinutes = Math.floor(Math.max(0, todaySeconds) / 60);
  if (goalMinutes >= 60) {
    return {
      done: doneMinutes ? shortHoursAndMinutes(doneMinutes) : "0",
      goal: goalTextFromMinutes(goalMinutes),
      long: true,
    };
  }
  return {
    done: String(doneMinutes),
    goal: `${goalMinutes} min`,
    long: false,
  };
}

/**
 * Today's share of the goal, never showing more than is done. It goes past
 * 100 once the learner has: whoever draws it as a length caps it there.
 */
export function percentOfGoal(todaySeconds: number, goalMinutes: number) {
  if (!(goalMinutes > 0)) return 0;
  return Math.floor((todaySeconds / (goalMinutes * 60)) * 100);
}

// Where today stands against the goal. The rule is shared with the
// Progress page, so a day reads the same on both.
import { goalStanding } from "../../services/learning-goals";

export { goalStanding };
export type { GoalStanding } from "../../services/learning-goals";

/**
 * The time learned past today's goal, rounded down to the minute, in the
 * two parts the laptop sets in different weights ("+35", "min extra";
 * "+1h 12m", "extra").
 */
export function timeOverGoalParts(todaySeconds: number, goalMinutes: number) {
  const minutes = Math.max(
    0,
    Math.floor((todaySeconds - goalMinutes * 60) / 60),
  );
  if (minutes < 60) return { amount: `+${minutes}`, label: "min extra" };
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return {
    amount: rest ? `+${hours}h ${rest}m` : `+${hours}h`,
    label: "extra",
  };
}

/**
 * How much of the bar the goal itself takes once the day has gone past it:
 * the rest of the bar is the extra. Held so that neither part shrinks to a
 * sliver, however little or much was added.
 */
export function goalShareOfDay(todaySeconds: number, goalMinutes: number) {
  if (!(todaySeconds > 0)) return 100;
  const share = ((goalMinutes * 60) / todaySeconds) * 100;
  return Math.min(88, Math.max(24, share));
}

/**
 * What is left of today's goal, rounded up to the minute, in the two parts
 * the laptop sets in different weights ("36", "min left"; "1h 12m", "left").
 */
export function timeLeftParts(todaySeconds: number, goalMinutes: number) {
  const minutes = Math.max(
    1,
    Math.ceil((goalMinutes * 60 - todaySeconds) / 60),
  );
  if (minutes < 60) return { amount: String(minutes), label: "min left" };
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return { amount: rest ? `${hours}h ${rest}m` : `${hours}h`, label: "left" };
}

/** This week's hours against the week's target ("4.5 / 7 hrs"). */
export function formatWeekAgainstTarget(
  weekSeconds: number,
  weekTargetSeconds: number,
) {
  return `${hoursLearned(weekSeconds)} / ${trimmed(weekTargetSeconds / 3600)} hrs`;
}

export function formatDayCount(days: number) {
  return `${days} ${days === 1 ? "day" : "days"}`;
}

/** A share of a whole as a width, held between 0 and 100%. */
export function shareOf(part: number, whole: number) {
  if (!(whole > 0)) return 0;
  return Math.min(100, Math.max(0, (part / whole) * 100));
}

/**
 * Today against the daily goal, worked out once for whatever draws it (the
 * laptop's screen, the phone's goal card).
 */
export function describeGoalDay(todaySeconds: number, goalMinutes: number) {
  const percent = percentOfGoal(todaySeconds, goalMinutes);
  const standing = goalStanding(todaySeconds, goalMinutes);
  const beyond = standing === "beyond";
  return {
    today: todayAgainstGoalParts(todaySeconds, goalMinutes),
    percent,
    standing,
    // The length of the bar's first part. Short of the goal that is the
    // share done, with a little showing as soon as anything is. Past the
    // goal it is the goal's share of the day, and the extra takes the rest.
    barShare: beyond
      ? goalShareOfDay(todaySeconds, goalMinutes)
      : percent > 0
        ? Math.min(100, Math.max(percent, 4))
        : 0,
  };
}
