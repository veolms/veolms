import { resolveLessonIdentifier } from "./courseContent";
import {
  LEARNING_PROGRESS_STORAGE_VERSION,
  getLearningProgressMap,
  readLearningProgress,
  type LocalLearningProgressState,
} from "./learningProgressStorage";

type BrowserStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const LAST_LESSON_PREFIX = "veolms-last-lesson-";
const LEGACY_PROGRESS_PREFIX = "veolms-learning-";
const LEGACY_PROGRESS_SUFFIX = "-progress";

function getBrowserStorage(): BrowserStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getCourseKeyAliases(
  courseKey: string,
  extraKeys: readonly string[] = [],
): string[] {
  const aliases = new Set<string>();
  for (const value of [courseKey, ...extraKeys]) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    aliases.add(trimmed);
    try {
      aliases.add(encodeURIComponent(trimmed));
    } catch {
      // Some course keys are already percent-encoded.
    }
    try {
      aliases.add(decodeURIComponent(trimmed));
    } catch {
      // Keep the raw key when it is not a valid encoding.
    }
  }
  return [...aliases];
}

export function getLastLessonStorageKey(courseKey: string): string {
  return `${LAST_LESSON_PREFIX}${encodeURIComponent(courseKey)}`;
}

export function getResumePersistenceKeys(
  courseKey: string,
  lessonNumber: number,
  extraCourseKeys: readonly string[] = [],
): string[] {
  return getCourseKeyAliases(courseKey, extraCourseKeys).map(
    (key) => `${key}-lesson-${lessonNumber}`,
  );
}

function readStoredLessonNumber(
  value: string | null | undefined,
): number | null {
  if (value == null || value === "") return null;
  return resolveLessonIdentifier(value);
}

function readLastLessonForKey(
  courseKey: string,
  storage: BrowserStorage | null,
): number | null {
  if (!storage) return null;
  try {
    for (const alias of getCourseKeyAliases(courseKey)) {
      const stored =
        storage.getItem(`${LAST_LESSON_PREFIX}${encodeURIComponent(alias)}`) ??
        storage.getItem(`${LAST_LESSON_PREFIX}${alias}`);
      const lessonId = readStoredLessonNumber(stored);
      if (lessonId) return lessonId;
    }
  } catch {
    return null;
  }
  return null;
}

function parseProgressMap(value: string | null): Record<number, number> {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return {};
    if (
      "version" in parsed &&
      (parsed as LocalLearningProgressState).version ===
        LEARNING_PROGRESS_STORAGE_VERSION &&
      Array.isArray((parsed as LocalLearningProgressState).items)
    ) {
      return getLearningProgressMap(parsed as LocalLearningProgressState);
    }
    return Object.entries(parsed as Record<string, unknown>).reduce<
      Record<number, number>
    >((progress, [key, raw]) => {
      const lessonNumber = Number(key);
      const percent = Number(raw);
      if (
        Number.isInteger(lessonNumber) &&
        lessonNumber > 0 &&
        Number.isFinite(percent)
      ) {
        progress[lessonNumber] = Math.max(
          0,
          Math.min(100, Math.round(percent)),
        );
      }
      return progress;
    }, {});
  } catch {
    return {};
  }
}

function readLegacyProgressMap(
  courseKey: string,
  storage: BrowserStorage | null,
): Record<number, number> {
  if (!storage) return {};
  const merged: Record<number, number> = {};
  for (const alias of getCourseKeyAliases(courseKey)) {
    const encoded = encodeURIComponent(alias);
    const raw =
      storage.getItem(
        `${LEGACY_PROGRESS_PREFIX}${encoded}${LEGACY_PROGRESS_SUFFIX}`,
      ) ??
      storage.getItem(
        `${LEGACY_PROGRESS_PREFIX}${alias}${LEGACY_PROGRESS_SUFFIX}`,
      );
    Object.assign(merged, parseProgressMap(raw));
  }
  return merged;
}

function readV1ProgressMaps(
  courseKey: string,
  userId: string | undefined,
): Record<number, number> {
  if (!userId) return {};
  const merged: Record<number, number> = {};
  for (const alias of getCourseKeyAliases(courseKey)) {
    Object.assign(
      merged,
      getLearningProgressMap(readLearningProgress(userId, alias)),
    );
  }
  return merged;
}

export function inferContinueLessonFromProgress(
  progressByLesson: Record<number, number>,
  maxLesson?: number,
): number | null {
  const entries = Object.entries(progressByLesson)
    .map(([key, percent]) => [Number(key), percent] as const)
    .filter(([lessonNumber]) => Number.isInteger(lessonNumber) && lessonNumber > 0)
    .sort((left, right) => left[0] - right[0]);
  if (entries.length === 0) return null;

  const inProgress = entries.filter(
    ([, percent]) => percent > 0 && percent < 100,
  );
  if (inProgress.length > 0) {
    return inProgress[inProgress.length - 1]![0];
  }

  const lastKnownLesson = entries[entries.length - 1]![0];
  const upperBound =
    Number.isInteger(maxLesson) && (maxLesson ?? 0) > 0
      ? Math.max(maxLesson ?? 0, lastKnownLesson)
      : lastKnownLesson;
  for (let lessonNumber = 1; lessonNumber <= upperBound; lessonNumber += 1) {
    if ((progressByLesson[lessonNumber] ?? 0) < 100) return lessonNumber;
  }
  if (maxLesson && lastKnownLesson < maxLesson) return lastKnownLesson + 1;
  return lastKnownLesson;
}

export interface ResolveContinueLessonOptions {
  userId?: string;
  courseId?: string;
  sessionLessonId?: number | null;
  progressByLesson?: Record<number, number>;
  maxLesson?: number;
  storage?: BrowserStorage | null;
}

export function resolveContinueLessonId(
  courseKey: string,
  options: ResolveContinueLessonOptions = {},
): number {
  const storage = options.storage === undefined ? getBrowserStorage() : options.storage;
  const storedLesson = readLastLessonForKey(courseKey, storage);
  const storedForId = options.courseId
    ? readLastLessonForKey(options.courseId, storage)
    : null;
  const lastLesson = storedLesson ?? storedForId;
  const progressByLesson = {
    ...readLegacyProgressMap(courseKey, storage),
    ...(options.courseId
      ? readLegacyProgressMap(options.courseId, storage)
      : {}),
    ...readV1ProgressMaps(courseKey, options.userId),
    ...(options.courseId
      ? readV1ProgressMaps(options.courseId, options.userId)
      : {}),
    ...(options.progressByLesson ?? {}),
  };
  const progressLesson = inferContinueLessonFromProgress(
    progressByLesson,
    options.maxLesson,
  );
  const sessionLesson =
    typeof options.sessionLessonId === "number" &&
    Number.isInteger(options.sessionLessonId) &&
    options.sessionLessonId > 0
      ? options.sessionLessonId
      : null;

  // A stored "lesson 1" is often the mount-time default, not the real resume
  // point. Prefer in-progress / first-incomplete work when it disagrees.
  if (progressLesson && progressLesson > 1 && (lastLesson ?? 1) <= 1) {
    return progressLesson;
  }
  if (lastLesson && lastLesson > 1) return lastLesson;
  if (sessionLesson && sessionLesson > 1) return sessionLesson;
  return progressLesson ?? lastLesson ?? sessionLesson ?? 1;
}

export function writeStoredCourseLessonId(
  courseKey: string,
  lessonId: number,
  extraCourseKeys: readonly string[] = [],
  storage: BrowserStorage | null = getBrowserStorage(),
): void {
  if (!storage || !Number.isInteger(lessonId) || lessonId < 1) return;
  try {
    for (const alias of getCourseKeyAliases(courseKey, extraCourseKeys)) {
      storage.setItem(
        `${LAST_LESSON_PREFIX}${encodeURIComponent(alias)}`,
        String(lessonId),
      );
    }
  } catch {
    // Lesson selection remains usable when browser storage is unavailable.
  }
}

export function migrateStoredCourseResumeKeys(
  previousCourseKey: string,
  nextCourseKey: string,
  storage: BrowserStorage | null = getBrowserStorage(),
): void {
  if (!storage || previousCourseKey === nextCourseKey) return;
  const lessonId =
    readLastLessonForKey(previousCourseKey, storage) ??
    readLastLessonForKey(nextCourseKey, storage);
  if (lessonId) {
    writeStoredCourseLessonId(nextCourseKey, lessonId, [previousCourseKey], storage);
  }

  if (!lessonId) return;
  try {
    const previousKeys = getResumePersistenceKeys(previousCourseKey, lessonId);
    const nextKeys = getResumePersistenceKeys(nextCourseKey, lessonId, [
      previousCourseKey,
    ]);
    let savedPosition: string | null = null;
    for (const key of previousKeys) {
      savedPosition = storage.getItem(`veolms-watch-${key}`);
      if (savedPosition) break;
    }
    if (!savedPosition) return;
    for (const key of nextKeys) {
      if (!storage.getItem(`veolms-watch-${key}`)) {
        storage.setItem(`veolms-watch-${key}`, savedPosition);
      }
    }
  } catch {
    // Resume migration is best-effort and must not block navigation.
  }
}
