import type {
  Chapter,
  ChapterInput,
  NormalizeChaptersOptions,
} from "./chapterTypes.ts";

interface IndexedChapter {
  chapter: ChapterInput;
  inputIndex: number;
}

function normalizedDuration(duration: number | undefined): number | undefined {
  if (duration === undefined || !Number.isFinite(duration) || duration < 0) {
    return undefined;
  }

  return duration;
}

function slugifyTitle(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return slug || "chapter";
}

function createChapterId(chapter: ChapterInput, title: string): string {
  const suppliedId = chapter.id?.trim();
  if (suppliedId) {
    return suppliedId;
  }

  const timeInMilliseconds = Math.round(chapter.startTime * 1_000);
  return `chapter-${timeInMilliseconds}-${slugifyTitle(title)}`;
}

function uniqueId(baseId: string, usedIds: Set<string>): string {
  if (!usedIds.has(baseId)) {
    usedIds.add(baseId);
    return baseId;
  }

  let suffix = 2;
  let candidate = `${baseId}-${suffix}`;
  while (usedIds.has(candidate)) {
    suffix += 1;
    candidate = `${baseId}-${suffix}`;
  }

  usedIds.add(candidate);
  return candidate;
}

/**
 * Produces a stable, sorted chapter list with half-open chapter ranges.
 *
 * Invalid entries and duplicate start times are discarded. When duplicate
 * timestamps exist, the first valid entry from the consumer wins. End times
 * are derived from the next chapter, and the final end time is the media
 * duration when a usable duration is supplied.
 */
export function normalizeChapters(
  chapters: readonly ChapterInput[],
  options: NormalizeChaptersOptions = {},
): Chapter[] {
  const duration = normalizedDuration(options.duration);
  if (duration === 0) {
    return [];
  }

  const candidates: IndexedChapter[] = [];

  chapters.forEach((chapter, inputIndex) => {
    const title = chapter.title.trim();
    const startTime = Object.is(chapter.startTime, -0) ? 0 : chapter.startTime;

    if (!title || !Number.isFinite(startTime) || startTime < 0) {
      return;
    }

    if (duration !== undefined && startTime >= duration) {
      return;
    }

    candidates.push({
      chapter: {
        ...chapter,
        title,
        startTime,
      },
      inputIndex,
    });
  });

  candidates.sort((left, right) => {
    const byTime = left.chapter.startTime - right.chapter.startTime;
    return byTime === 0 ? left.inputIndex - right.inputIndex : byTime;
  });

  const usedStartTimes = new Set<number>();
  const usedIds = new Set<string>();
  const normalized: Chapter[] = [];

  for (const candidate of candidates) {
    const { chapter } = candidate;
    if (usedStartTimes.has(chapter.startTime)) {
      continue;
    }

    usedStartTimes.add(chapter.startTime);
    normalized.push({
      id: uniqueId(createChapterId(chapter, chapter.title), usedIds),
      title: chapter.title,
      startTime: chapter.startTime,
    });
  }

  for (let index = 0; index < normalized.length; index += 1) {
    const chapter = normalized[index];
    if (!chapter) {
      continue;
    }

    const nextChapter = normalized[index + 1];
    if (nextChapter) {
      chapter.endTime = nextChapter.startTime;
    } else if (duration !== undefined) {
      chapter.endTime = duration;
    }
  }

  return normalized;
}
