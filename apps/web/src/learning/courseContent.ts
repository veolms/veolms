import { CURRICULUM_LECTURE_COUNT_MAX } from "./curriculumSize";

export interface CourseVideo {
  fileName: string;
  duration: number;
  src: string;
  thumbnailSrc?: string;
}

export type LessonStatus = "done" | "active" | "todo";
export type LessonContentType = "video" | "document" | "quiz";
export type Lesson = [
  number,
  string,
  string,
  LessonStatus,
  boolean?,
  LessonContentType?,
  string?,
];

export interface CourseSection {
  id: number;
  title: string;
  progress: string;
  lessons: Lesson[];
}

export const formatMediaTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;
  if (hours)
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
};

/**
 * Sum of the lessons' display durations ("mm:ss" or "h:mm:ss"), as a compact
 * label like "4h 45m" or "47m". Lessons without a parseable duration (such
 * as readings and quizzes) are skipped; "" when nothing is parseable.
 */
export function formatTotalLessonDuration(lessons: readonly Lesson[]): string {
  let totalSeconds = 0;
  for (const [, , duration] of lessons) {
    const parts = duration.trim().split(":");
    if (parts.length < 2 || parts.length > 3) continue;
    if (parts.some((part) => !/^\d+$/.test(part))) continue;
    const [hours, minutes, seconds] =
      parts.length === 3
        ? (parts.map(Number) as [number, number, number])
        : [0, Number(parts[0]), Number(parts[1])];
    totalSeconds += hours * 3600 + minutes * 60 + seconds;
  }
  if (totalSeconds === 0) return "";
  const totalMinutes = Math.max(1, Math.round(totalSeconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

/**
 * Player media for a lesson whose playable manifest comes from the playback
 * bootstrap API. It carries only display metadata and never a fallback URL.
 */
export const createLessonVideo = (
  title: string,
  options: { durationSeconds?: number | null; thumbnailSrc?: string } = {},
): CourseVideo => ({
  fileName: title,
  duration: options.durationSeconds ?? 0,
  src: "",
  thumbnailSrc: options.thumbnailSrc,
});

export const createLessonsById = (courseSections: readonly CourseSection[]) =>
  new Map<number, Lesson>(
    courseSections.flatMap((section) =>
      section.lessons.map((item): [number, Lesson] => [item[0], item]),
    ),
  );

export const createLessonSequence = (
  courseSections: readonly CourseSection[],
) => courseSections.flatMap(({ lessons }) => lessons.map(([id]) => id));

export function getLessonSlug(lessonId: number): string {
  const normalizedId =
    Number.isInteger(lessonId) &&
    lessonId > 0 &&
    lessonId <= CURRICULUM_LECTURE_COUNT_MAX
      ? lessonId
      : 1;
  return `lecture-${normalizedId}`;
}

export function resolveLessonIdentifier(
  identifier: string | number | null | undefined,
): number | null {
  if (typeof identifier === "number")
    return Number.isInteger(identifier) &&
      identifier > 0 &&
      identifier <= CURRICULUM_LECTURE_COUNT_MAX
      ? identifier
      : null;
  if (!identifier) return null;

  const normalizedIdentifier = identifier.trim().toLowerCase();
  const idMatch = /^(?:lesson-|lecture-)?(\d+)$/.exec(normalizedIdentifier);
  if (!idMatch) return null;
  const lessonId = Number(idMatch[1]);
  return lessonId > 0 && lessonId <= CURRICULUM_LECTURE_COUNT_MAX
    ? lessonId
    : null;
}
