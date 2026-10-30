/**
 * Where a day stands against its goal. One rule for everything that shows
 * it (the laptop on the learner's home, the Progress page), so a day reads
 * the same wherever it is drawn.
 */

/**
 * How far past the goal a day has to be before it is called more than
 * complete. A minute or two over is the goal met, not a second achievement.
 */
const BEYOND_GOAL_MINUTES = 5;

/** Short of the goal, at it, or well past it. */
export type GoalStanding = "under" | "completed" | "beyond";

export function goalStanding(
  seconds: number,
  goalMinutes: number,
): GoalStanding {
  const secondsOver = seconds - goalMinutes * 60;
  if (secondsOver < 0) return "under";
  return secondsOver >= BEYOND_GOAL_MINUTES * 60 ? "beyond" : "completed";
}
