/**
 * What the document's head drew a lesson page from, handed to the app.
 *
 * The head's script (`learning/lessonPageEarlyState.ts`) fills a lesson
 * page in from the browser's copies of the learner's answers before the
 * page is drawn, and the page's first render has to come to the very same
 * text, or React throws the page away and draws it again. The two read the
 * same storage, but a second or more apart: another tab playing a lesson
 * writes the course's progress copy every few seconds, so the first render
 * could read a newer copy than the head had drawn, and did ("63% complete"
 * on a card against "77%"). So the head leaves what it read here, as it
 * read it, and the first render takes that over storage. Once the page has
 * hydrated the record is dropped (`startAccountSessionCopies`) and storage
 * is the truth again; what changed meanwhile comes in the usual ways (the
 * server's snapshot, the `storage` event).
 */

export const LESSON_EARLY_STATE_GLOBAL = "__veoLessonEarlyState";

export interface LessonEarlyStateRecord {
  userId: string;
  courseSlug: string;
  /** The progress copy as read: the raw string, or null when there was none. */
  progress: string | null;
  /**
   * Session-storage copies as read, by their storage key: the parsed
   * `{ value, savedAt }`, or null when there was none (or it was not usable).
   */
  copies: Record<string, { value: unknown; savedAt: number } | null>;
}

function getRecord(): LessonEarlyStateRecord | undefined {
  if (typeof window === "undefined") return undefined;
  const record = (window as unknown as Record<string, unknown>)[
    LESSON_EARLY_STATE_GLOBAL
  ];
  return record && typeof record === "object"
    ? (record as LessonEarlyStateRecord)
    : undefined;
}

/**
 * The progress copy the head drew the page from, for this learner and
 * course: the raw string, null when the head found none, undefined when
 * the head left nothing (another page, a guest, or already handed over).
 */
export function readEarlyProgressCopy(
  userId: string | undefined,
  courseKey: string | undefined,
): string | null | undefined {
  const record = getRecord();
  if (!record || !userId || !courseKey) return undefined;
  return record.userId === userId && record.courseSlug === courseKey
    ? record.progress
    : undefined;
}

/**
 * A session-storage copy as the head read it, by storage key: undefined
 * when the head did not read that key.
 */
export function readEarlySessionCopy(
  storageKey: string,
): { value: unknown; savedAt: number } | null | undefined {
  const record = getRecord();
  if (!record || !(storageKey in record.copies)) return undefined;
  return record.copies[storageKey] ?? null;
}

/** Once the page has hydrated: storage is the truth from here. */
export function clearLessonEarlyState(): void {
  if (typeof window === "undefined") return;
  delete (window as unknown as Record<string, unknown>)[
    LESSON_EARLY_STATE_GLOBAL
  ];
}
