import type { CourseAccessPace } from "@veolms/contracts";

const DAY_MS = 24 * 60 * 60 * 1000;

/** How far back the pace looks: the learner's last four weeks. */
export const PACE_WINDOW_DAYS = 28;

/** Fewer days of study than this say too little to give a pace. */
export const PACE_MIN_DAYS = 14;

/**
 * The learner's pace in a course: lessons completed a week over their last
 * four weeks (or over the days since they began, when that is less), and
 * when they would finish at that rate. Null until they have studied for two
 * weeks.
 */
export function decidePace({
  now,
  firstActivityOn,
  recentCompletions,
  lessonsLeft,
}: {
  now: Date;
  /** The first day the learner studied the course; null if never. */
  firstActivityOn: Date | null;
  /** Lessons completed in the last `PACE_WINDOW_DAYS` days. */
  recentCompletions: number;
  lessonsLeft: number;
}): CourseAccessPace | null {
  if (!firstActivityOn) return null;
  const daysStudying = (now.getTime() - firstActivityOn.getTime()) / DAY_MS;
  if (daysStudying < PACE_MIN_DAYS) return null;

  const windowDays = Math.min(PACE_WINDOW_DAYS, daysStudying);
  const lessonsPerWeek =
    Math.round(((recentCompletions * 7) / windowDays) * 10) / 10;
  const projectedFinishAt =
    lessonsLeft > 0 && lessonsPerWeek > 0
      ? new Date(
          now.getTime() + (lessonsLeft / lessonsPerWeek) * 7 * DAY_MS,
        ).toISOString()
      : null;
  return { lessonsPerWeek, projectedFinishAt };
}
