/**
 * A lesson opened by a press that means "play it": the home's Enter key.
 *
 * The lesson page opens paused, as a page the learner arrives at to look
 * at. Opened from the home's hero, which says "Enter" and has the lesson
 * ready to play (see home/learner/useHeroLessonWarmUp.ts), it starts
 * playing at once instead, as a lesson picked inside the page does. The
 * press is the learner's own, so the browser lets it play with sound.
 *
 * The request is held in memory for the next lesson page of that course to
 * open, for a few seconds: a reload, or a page opened later, plays nothing
 * by itself.
 */
const REQUEST_LIFETIME_MS = 10_000;

let request: { courseSlug: string; at: number } | null = null;

export function requestLessonAutoplay(courseSlug: string) {
  request = { courseSlug, at: Date.now() };
}

/** Whether the lesson page of this course opens playing. Asked once. */
export function consumeLessonAutoplayRequest(
  courseSlug: string | undefined,
): boolean {
  const asked = request;
  // Forgotten once this render is over (a development render asks twice).
  queueMicrotask(() => {
    if (request === asked) request = null;
  });
  return Boolean(
    asked &&
    courseSlug &&
    asked.courseSlug === courseSlug &&
    Date.now() - asked.at < REQUEST_LIFETIME_MS,
  );
}
