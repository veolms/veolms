/** One decimal at most, and none when it would be ".0". */
function trimmed(value: number) {
  return String(Math.round(value * 10) / 10);
}

/** Time learned so far, rounded down so it never claims an unearned minute. */
function hoursLearned(seconds: number) {
  return trimmed(Math.floor((seconds / 3600) * 10) / 10);
}

/**
 * Today's time against the daily goal: minutes for a goal under two hours,
 * hours from there on ("45 / 60 min", "1.5 / 2 hrs").
 */
export function formatTodayAgainstGoal(
  todaySeconds: number,
  goalMinutes: number,
) {
  if (goalMinutes >= 120) {
    return `${hoursLearned(todaySeconds)} / ${trimmed(goalMinutes / 60)} hrs`;
  }
  return `${Math.floor(todaySeconds / 60)} / ${goalMinutes} min`;
}

/** Time learned, on its own: "25 min", "1.5 hrs". */
export function formatLearnedTime(seconds: number) {
  if (seconds >= 3600) return `${hoursLearned(seconds)} hrs`;
  return `${Math.floor(seconds / 60)} min`;
}

/** This week's hours against the week's target ("4.5 / 7 hrs"). */
export function formatWeekAgainstTarget(
  weekSeconds: number,
  weekTargetSeconds: number,
) {
  return `${hoursLearned(weekSeconds)} / ${trimmed(weekTargetSeconds / 3600)} hrs`;
}

/** What is left of today's goal, rounded up to the minute. */
export function formatTimeToGo(remainingSeconds: number) {
  const minutes = Math.max(1, Math.ceil(remainingSeconds / 60));
  if (minutes < 60) return `${minutes} min to go`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} hr ${rest} min to go` : `${hours} hr to go`;
}

export function formatDayCount(days: number) {
  return `${days} ${days === 1 ? "day" : "days"}`;
}

/** A share of a whole as a width, held between 0 and 100%. */
export function shareOf(part: number, whole: number) {
  if (!(whole > 0)) return 0;
  return Math.min(100, Math.max(0, (part / whole) * 100));
}
