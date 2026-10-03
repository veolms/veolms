import { CURRICULUM_LECTURE_COUNT_MAX } from "./curriculumSize";

export interface CourseVideo {
  fileName: string;
  duration: number;
  src: string;
  thumbnailSrc?: string;
}

export type LessonStatus = "done" | "active" | "todo";
export type LessonContentType = "video" | "document" | "quiz";
export type Lesson = [number, string, string, LessonStatus, boolean?, LessonContentType?, string?];

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

export const createLessonSequence = (courseSections: readonly CourseSection[]) =>
  courseSections.flatMap(({ lessons }) => lessons.map(([id]) => id));

export function getLessonSlug(lessonId: number): string {
  const normalizedId =
    Number.isInteger(lessonId) && lessonId > 0 && lessonId <= CURRICULUM_LECTURE_COUNT_MAX
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
  return lessonId > 0 && lessonId <= CURRICULUM_LECTURE_COUNT_MAX ? lessonId : null;
}
