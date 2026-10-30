import type { LocalLearningProgressItem } from "./learningProgressStorage";

/**
 * The progress percent a course card shows to its learner.
 *
 * The server's figure is the truth: the average of the learner's lessons
 * over the whole course. This browser may also hold progress it has not
 * sent yet (`pending`, in the account's own store, see
 * `learningProgressStorage.ts`), and the card may count that on top, so a
 * learner who has just watched something sees it at once.
 *
 * Nothing else raises the card above the server. It used to show the higher
 * of the server's figure and an estimate from a browser-wide map the player
 * wrote, which nothing ever lowered: after the server cleared a lesson (a
 * lesson given its first video), the card went on showing the old percent
 * while Home and the lesson page were right.
 *
 * What is held as already sent is not counted over the server either: until
 * the lesson page is opened again it has not been compared with the server,
 * and may hold a lesson the server has since cleared. So unsent progress
 * adds at most its own lessons' share to the server's figure.
 *
 * Returns `null` when there is nothing to show.
 */
export function getCatalogueCardProgressPercent(input: {
  /** A viewer with no account has no progress of their own to show. */
  signedIn: boolean;
  /** The server's figure for the course, if it has given one. */
  serverPercent: number | null | undefined;
  totalLessons: number;
  /** The signed-in account's stored progress on the course. */
  localItems: readonly Pick<
    LocalLearningProgressItem,
    "lessonNumber" | "progressPercent" | "pending"
  >[];
}): number | null {
  if (!input.signedIn) return null;

  const serverPercent =
    typeof input.serverPercent === "number" &&
    Number.isFinite(input.serverPercent)
      ? clampPercent(input.serverPercent)
      : null;
  if (input.totalLessons <= 0) return serverPercent;

  const percentByLesson = new Map<number, number>();
  const pendingPercentByLesson = new Map<number, number>();
  for (const item of input.localItems) {
    if (!Number.isFinite(item.progressPercent)) continue;
    const percent = clampPercent(item.progressPercent);
    percentByLesson.set(
      item.lessonNumber,
      Math.max(percentByLesson.get(item.lessonNumber) ?? 0, percent),
    );
    if (item.pending) {
      pendingPercentByLesson.set(
        item.lessonNumber,
        Math.max(pendingPercentByLesson.get(item.lessonNumber) ?? 0, percent),
      );
    }
  }
  if (percentByLesson.size === 0) return serverPercent;

  const courseShare = (percents: Iterable<number>) => {
    let sum = 0;
    for (const percent of percents) sum += percent;
    return sum / input.totalLessons;
  };
  const localPercent = clampPercent(courseShare(percentByLesson.values()));
  // The server has said nothing yet: the account's own store is all there is.
  if (serverPercent === null) return localPercent;
  if (pendingPercentByLesson.size === 0) return serverPercent;

  const withUnsent = clampPercent(
    serverPercent + courseShare(pendingPercentByLesson.values()),
  );
  return Math.max(serverPercent, Math.min(localPercent, withUnsent));
}

/** Held to two decimals, as course progress is shown (0.42%). */
function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 100) / 100));
}
