import type { LearningProgressLesson } from "@veolms/contracts";
import {
  LEARNING_PROGRESS_STORAGE_VERSION,
  mergeServerLearningProgress,
  type LocalLearningProgressState,
} from "./learningProgressStorage";

/**
 * Progress the server has taken back.
 *
 * Stored progress only ever rises, with one exception: when a lesson that
 * had no video is given one, the server clears every learner's progress on
 * it. Such a lesson is finished by opening it, and once it has a video
 * nobody has watched it.
 *
 * The browser keeps its own copy of the learner's progress and merged the
 * server's into it by "the higher one wins". So the browser a learner had
 * opened that lesson in went on showing it finished; and because its copy
 * already stood at 100, watching the new video changed nothing in it, was
 * never reported, and the course could not be completed from that browser
 * again.
 *
 * A snapshot that was asked for after everything this browser holds as
 * synced had reached the server is the whole truth about those items. For
 * such a snapshot the copy comes down to it.
 */

/**
 * Whether a progress snapshot may lower what is held as synced. It may only
 * when it was received for a request sent after the last moment synced
 * progress was taken in (on load, after a sync, from another tab):
 *
 * - a cached snapshot, shown again while the page loads, was received
 *   before any request of this page, so it never qualifies: it can be
 *   minutes older than progress synced since;
 * - a request overtaken by a sync is answered from before that sync.
 *
 * Times are `Date.now()` values; `0` stands for "never".
 */
export function snapshotAnswersSyncedProgress(times: {
  /** When the latest snapshot request was sent. */
  requestedAt: number;
  /** When the snapshot in hand was received. */
  receivedAt: number;
  /** When synced progress was last taken into the local copy. */
  syncedProgressKnownAt: number;
}): boolean {
  return (
    times.requestedAt > 0 &&
    times.receivedAt >= times.requestedAt &&
    times.requestedAt >= times.syncedProgressKnownAt
  );
}

/**
 * As `mergeServerLearningProgress`, for a snapshot that answers the synced
 * progress (see above): a synced item the server holds lower comes down to
 * the server's figure, and one the server does not hold at all is dropped.
 *
 * Progress not sent yet (`pending`), and progress recorded before the
 * lesson's id was known, is the learner's newest and is kept as it is.
 */
export function adoptServerLearningProgress(
  state: LocalLearningProgressState,
  lessons: readonly LearningProgressLesson[],
): LocalLearningProgressState {
  const merged = mergeServerLearningProgress(state, lessons);
  const serverPercentByLessonId = new Map(
    lessons.map((lesson) => [lesson.lessonId, lesson.progressPercent]),
  );

  let changed = false;
  const items = merged.items.flatMap((item) => {
    if (item.pending || !item.lessonId) return [item];
    const serverPercent = serverPercentByLessonId.get(item.lessonId) ?? 0;
    if (item.progressPercent <= serverPercent) return [item];
    changed = true;
    return serverPercent > 0
      ? [{ ...item, progressPercent: serverPercent }]
      : [];
  });

  return changed
    ? { version: LEARNING_PROGRESS_STORAGE_VERSION, items }
    : merged;
}
