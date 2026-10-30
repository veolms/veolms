/**
 * Where the learner is in each lesson's video, waiting to be sent to the
 * server, so that the course resumes there on any device.
 *
 * The players keep the position in this browser as they play (every few
 * seconds, on pause, when the lesson changes; see lessonPlayerPersistence)
 * and note it here at the same time. Whichever progress heartbeat goes out
 * next for the course takes what is noted with it (useLearningProgress),
 * as the watch-time tally does (learningWatchTime). Lessons are kept in the
 * order they were played, the last played last: the server stamps them in
 * that order, and the course's last played lesson is the one stamped last.
 */
const positionsByCourse = new Map<string, Map<number, number>>();

/** The most positions one batch carries: the lessons played last. */
const MAX_POSITIONS_PER_BATCH = 10;

/**
 * Set once the API has turned a batch with positions down as not valid (an
 * API from before positions were kept). Batches then go without them, so
 * progress and watch time are still saved.
 */
let positionsRefused = false;

export function refuseLessonPositions(): void {
  positionsRefused = true;
  positionsByCourse.clear();
}

/** A lesson's player key (`<course>-lesson-<n>`), read back. */
export function parseLessonMediaKey(
  mediaKey: string,
): { courseKey: string; lessonNumber: number } | null {
  const marker = mediaKey.lastIndexOf("-lesson-");
  if (marker <= 0) return null;
  const lessonNumber = Number(mediaKey.slice(marker + "-lesson-".length));
  if (!Number.isInteger(lessonNumber) || lessonNumber < 1) return null;
  try {
    return {
      courseKey: decodeURIComponent(mediaKey.slice(0, marker)),
      lessonNumber,
    };
  } catch {
    return null;
  }
}

export function noteLessonPosition(
  courseKey: string,
  lessonNumber: number,
  seconds: number,
): void {
  if (positionsRefused || !Number.isFinite(seconds) || seconds < 0) return;
  let positions = positionsByCourse.get(courseKey);
  if (!positions) {
    positions = new Map();
    positionsByCourse.set(courseKey, positions);
  }
  // Moved to the end: the lesson played last is listed last.
  positions.delete(lessonNumber);
  positions.set(lessonNumber, Math.floor(seconds));
}

export function hasLessonPositions(courseKey: string): boolean {
  return (positionsByCourse.get(courseKey)?.size ?? 0) > 0;
}

/**
 * The course's lesson played last in this tab, while the server has not
 * been told yet: newer than what it would answer. None for a lesson left
 * at its end (noted at 0), after which the server's answer, the next
 * lesson, is the one to go on with.
 */
export function peekLastPlayedLesson(courseKey: string): number | null {
  const positions = positionsByCourse.get(courseKey);
  const last = positions ? [...positions].at(-1) : undefined;
  return last && last[1] > 0 ? last[0] : null;
}

/**
 * Takes the positions noted for a course, in the order they were played
 * (only the lessons played last, `MAX_POSITIONS_PER_BATCH`; where the
 * learner was in the ones before matters little). What is taken is gone:
 * hand it back with `restoreLessonPositions` if the request that carried
 * it failed.
 */
export function takeLessonPositions(
  courseKey: string,
): [lessonNumber: number, seconds: number][] {
  const positions = positionsByCourse.get(courseKey);
  if (!positions) return [];
  positionsByCourse.delete(courseKey);
  return [...positions.entries()].slice(-MAX_POSITIONS_PER_BATCH);
}

/** Puts back positions that were not sent, before any noted since. */
export function restoreLessonPositions(
  courseKey: string,
  taken: readonly [lessonNumber: number, seconds: number][],
): void {
  if (taken.length === 0) return;
  const since = positionsByCourse.get(courseKey) ?? new Map<number, number>();
  const restored = new Map<number, number>();
  for (const [lessonNumber, seconds] of taken) {
    if (!since.has(lessonNumber)) restored.set(lessonNumber, seconds);
  }
  for (const [lessonNumber, seconds] of since) {
    restored.set(lessonNumber, seconds);
  }
  positionsByCourse.set(courseKey, restored);
}

interface ProgressItem {
  lessonId: string;
  progressPercent: number;
  positionSeconds?: number;
}

/**
 * A batch's items with the positions taken for it: a lesson with progress
 * to send carries its position too, and one with none is sent with 0 (the
 * server keeps the higher progress). Lessons with a position are listed
 * last, in the order they were played. A lesson whose id is not known is
 * left out.
 */
export function withLessonPositions(
  items: readonly { lessonId: string; progressPercent: number }[],
  positions: readonly [lessonNumber: number, seconds: number][],
  lessonIdsByNumber: ReadonlyMap<number, string> | undefined,
): ProgressItem[] {
  if (positions.length === 0 || !lessonIdsByNumber) return [...items];
  const progressById = new Map(
    items.map(({ lessonId, progressPercent }) => [lessonId, progressPercent]),
  );
  const positioned: ProgressItem[] = [];
  for (const [lessonNumber, seconds] of positions) {
    const lessonId = lessonIdsByNumber.get(lessonNumber);
    if (!lessonId) continue;
    positioned.push({
      lessonId,
      progressPercent: progressById.get(lessonId) ?? 0,
      positionSeconds: Math.min(86_400, Math.max(0, Math.floor(seconds))),
    });
    progressById.delete(lessonId);
  }
  return [
    ...[...progressById].map(([lessonId, progressPercent]) => ({
      lessonId,
      progressPercent,
    })),
    ...positioned,
  ];
}
