import type { Chapter } from "./chapterTypes.ts";

/** Returns the latest chapter whose half-open time range contains `time`. */
export function getChapterAtTime(
  chapters: readonly Chapter[],
  time: number,
): Chapter | null {
  if (!Number.isFinite(time) || time < 0) {
    return null;
  }

  let activeChapter: Chapter | null = null;

  for (const chapter of chapters) {
    if (!Number.isFinite(chapter.startTime) || chapter.startTime > time) {
      continue;
    }

    if (
      chapter.endTime !== undefined &&
      Number.isFinite(chapter.endTime) &&
      time >= chapter.endTime
    ) {
      continue;
    }

    if (!activeChapter || chapter.startTime > activeChapter.startTime) {
      activeChapter = chapter;
    }
  }

  return activeChapter;
}

export function getActiveChapter(
  chapters: readonly Chapter[],
  time: number,
): Chapter | null {
  return getChapterAtTime(chapters, time);
}
