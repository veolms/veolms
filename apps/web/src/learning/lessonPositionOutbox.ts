import { noteProgressActivity } from "./progressSyncSchedule";
import { createTabOutboxStorage } from "./tabOutboxStorage";

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
 *
 * Each position goes with how long ago it was noted, so the server can tell
 * it from a newer one another device has sent since (a position held here
 * while offline must not move the learner back). The queue is also kept in
 * local storage (tabOutboxStorage) and sent by the next tab if this one
 * closes or crashes first.
 */
interface NotedPosition {
  seconds: number;
  /** When it was noted, by this browser's clock (ms). */
  notedAt: number;
}

/** A position as taken for a batch: lesson number, seconds, when noted. */
export type TakenLessonPosition = [
  lessonNumber: number,
  seconds: number,
  notedAt: number,
];

const positionsByCourse = new Map<string, Map<number, NotedPosition>>();
const storedQueue = createTabOutboxStorage<
  Record<string, TakenLessonPosition[]>
>("lesson-position-outbox");
let adopted = false;

/** The most positions one batch carries: the lessons played last. */
const MAX_POSITIONS_PER_BATCH = 10;
/** The oldest a position may say it is (the API's limit). */
const MAX_POSITION_AGE_SECONDS = 604_800;

/**
 * Set once the API has turned a batch with positions down as not valid (an
 * API from before positions were kept). Batches then go without them, so
 * progress and watch time are still saved.
 */
let positionsRefused = false;
/**
 * Set once the API has turned down a batch whose positions said how old
 * they were (an API from before ages were read). Positions then go without
 * their age, as before.
 */
let positionAgesRefused = false;

function readQueue(): Record<string, TakenLessonPosition[]> | null {
  const queue: Record<string, TakenLessonPosition[]> = {};
  for (const [courseKey, positions] of positionsByCourse) {
    if (positions.size === 0) continue;
    queue[courseKey] = [...positions].map(
      ([lessonNumber, { seconds, notedAt }]) => [
        lessonNumber,
        seconds,
        notedAt,
      ],
    );
  }
  return Object.keys(queue).length > 0 ? queue : null;
}

/** Takes over, once, positions that tabs that are gone left unsent. */
function adoptLeftPositions() {
  if (adopted) return;
  adopted = true;
  for (const queue of storedQueue.adoptOrphans()) {
    for (const [courseKey, taken] of Object.entries(queue)) {
      if (Array.isArray(taken)) mergeOlder(courseKey, taken);
    }
  }
}

/**
 * Adds positions noted before what this tab holds: a lesson already held
 * keeps this tab's position, and the older ones are listed first.
 */
function mergeOlder(
  courseKey: string,
  taken: readonly TakenLessonPosition[],
): void {
  const since =
    positionsByCourse.get(courseKey) ?? new Map<number, NotedPosition>();
  const merged = new Map<number, NotedPosition>();
  for (const entry of taken) {
    if (!Array.isArray(entry)) continue;
    const [lessonNumber, seconds, notedAt] = entry;
    if (
      !Number.isInteger(lessonNumber) ||
      !Number.isFinite(seconds) ||
      since.has(lessonNumber)
    ) {
      continue;
    }
    merged.set(lessonNumber, {
      seconds,
      notedAt: Number.isFinite(notedAt) ? notedAt : Date.now(),
    });
  }
  for (const [lessonNumber, position] of since) {
    merged.set(lessonNumber, position);
  }
  if (merged.size > 0) positionsByCourse.set(courseKey, merged);
}

export function refuseLessonPositions(): void {
  positionsRefused = true;
  positionsByCourse.clear();
  storedQueue.save(null);
}

/**
 * The API turned down a batch that carried positions. The first time, the
 * positions go again without their age (an API that keeps positions but
 * does not read ages yet); after that, without positions at all.
 */
export function handleRefusedLessonPositions(
  courseKey: string,
  taken: readonly TakenLessonPosition[],
): void {
  if (!positionAgesRefused) {
    positionAgesRefused = true;
    restoreLessonPositions(courseKey, taken);
    return;
  }
  refuseLessonPositions();
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
  adoptLeftPositions();
  let positions = positionsByCourse.get(courseKey);
  if (!positions) {
    positions = new Map();
    positionsByCourse.set(courseKey, positions);
  }
  // Moved to the end: the lesson played last is listed last.
  positions.delete(lessonNumber);
  positions.set(lessonNumber, {
    seconds: Math.floor(seconds),
    notedAt: Date.now(),
  });
  storedQueue.saveSoon(readQueue);
  noteProgressActivity();
}

export function hasLessonPositions(courseKey: string): boolean {
  adoptLeftPositions();
  return (positionsByCourse.get(courseKey)?.size ?? 0) > 0;
}

/**
 * The course's lesson played last in this tab, while the server has not
 * been told yet: newer than what it would answer. None for a lesson left
 * at its end (noted at 0), after which the server's answer, the next
 * lesson, is the one to go on with.
 */
export function peekLastPlayedLesson(courseKey: string): number | null {
  adoptLeftPositions();
  const positions = positionsByCourse.get(courseKey);
  const last = positions ? [...positions].at(-1) : undefined;
  return last && last[1].seconds > 0 ? last[0] : null;
}

/**
 * Takes the positions noted for a course, in the order they were played
 * (only the lessons played last, `MAX_POSITIONS_PER_BATCH`; where the
 * learner was in the ones before matters little). What is taken is gone:
 * hand it back with `restoreLessonPositions` if the request that carried
 * it failed.
 */
export function takeLessonPositions(courseKey: string): TakenLessonPosition[] {
  adoptLeftPositions();
  const positions = positionsByCourse.get(courseKey);
  if (!positions) return [];
  positionsByCourse.delete(courseKey);
  // Written at once: a copy left in storage would be sent again.
  storedQueue.save(readQueue());
  return [...positions.entries()]
    .slice(-MAX_POSITIONS_PER_BATCH)
    .map(([lessonNumber, { seconds, notedAt }]) => [
      lessonNumber,
      seconds,
      notedAt,
    ]);
}

/** Puts back positions that were not sent, before any noted since. */
export function restoreLessonPositions(
  courseKey: string,
  taken: readonly TakenLessonPosition[],
): void {
  if (taken.length === 0) return;
  mergeOlder(courseKey, taken);
  storedQueue.save(readQueue());
}

interface ProgressItem {
  lessonId: string;
  progressPercent: number;
  positionSeconds?: number;
  positionAgeSeconds?: number;
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
  positions: readonly TakenLessonPosition[],
  lessonIdsByNumber: ReadonlyMap<number, string> | undefined,
): ProgressItem[] {
  if (positions.length === 0 || !lessonIdsByNumber) return [...items];
  const progressById = new Map(
    items.map(({ lessonId, progressPercent }) => [lessonId, progressPercent]),
  );
  const now = Date.now();
  const positioned: ProgressItem[] = [];
  for (const [lessonNumber, seconds, notedAt] of positions) {
    const lessonId = lessonIdsByNumber.get(lessonNumber);
    if (!lessonId) continue;
    positioned.push({
      lessonId,
      progressPercent: progressById.get(lessonId) ?? 0,
      positionSeconds: Math.min(86_400, Math.max(0, Math.floor(seconds))),
      ...(positionAgesRefused
        ? {}
        : {
            positionAgeSeconds: Math.min(
              MAX_POSITION_AGE_SECONDS,
              Math.max(0, Math.round((now - notedAt) / 1000)),
            ),
          }),
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
