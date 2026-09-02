import type {
  Chapter,
  ChapterInput,
  ParseChaptersOptions,
} from "./chapterTypes.ts";
import { normalizeChapters } from "./normalizeChapters.ts";

const CHAPTER_LINE_PATTERN =
  /^\s*(?:(?:[-*\u2022]|\d+[.)])\s+)?(\d+:\d{2}(?::\d{2})?)\s+(\S(?:.*\S)?)\s*$/;

/** Parses a chapter timestamp in MM:SS or HH:MM:SS form. */
export function parseChapterTimestamp(timestamp: string): number | null {
  const parts = timestamp.split(":");
  if (parts.length !== 2 && parts.length !== 3) {
    return null;
  }

  const values = parts.map((part) => {
    if (!/^\d+$/.test(part)) {
      return Number.NaN;
    }

    return Number(part);
  });

  if (values.some((value) => !Number.isSafeInteger(value))) {
    return null;
  }

  if (values.length === 2) {
    const minutes = values[0];
    const seconds = values[1];
    if (minutes === undefined || seconds === undefined || seconds >= 60) {
      return null;
    }

    return minutes * 60 + seconds;
  }

  const hours = values[0];
  const minutes = values[1];
  const seconds = values[2];
  if (
    hours === undefined ||
    minutes === undefined ||
    seconds === undefined ||
    minutes >= 60 ||
    seconds >= 60
  ) {
    return null;
  }

  return hours * 3_600 + minutes * 60 + seconds;
}

/**
 * Parses only lines that begin with a complete timestamp followed by a title.
 * Incidental numbers, URLs, negative values, and malformed timestamps are
 * intentionally ignored.
 */
export function parseChaptersFromDescription(
  description: string,
  options: ParseChaptersOptions = {},
): Chapter[] {
  const parsed: ChapterInput[] = [];

  for (const line of description.split(/\r?\n/)) {
    const match = CHAPTER_LINE_PATTERN.exec(line);
    if (!match) {
      continue;
    }

    const timestamp = match[1];
    const title = match[2];
    if (timestamp === undefined || title === undefined) {
      continue;
    }

    const startTime = parseChapterTimestamp(timestamp);
    if (startTime === null) {
      continue;
    }

    parsed.push({ title, startTime });
  }

  return normalizeChapters(parsed, options);
}
