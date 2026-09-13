import type {
  CourseLesson,
  CourseOverviewResponse,
} from "@veolms/contracts";
import {
  formatMediaTime,
  type CourseSection,
  type Lesson,
} from "./courseContent";

export interface AdaptedCurriculumSection extends CourseSection {
  /** Original section UUID from the API */
  sectionId: string;
}

export interface AdaptedCurriculum {
  sections: AdaptedCurriculumSection[];
  lessonsByNumber: Map<number, CourseLesson>;
  totalLessons: number;
}

/**
 * Pure adapter converting a backend `CourseOverviewResponse` into the
 * Learning Space curriculum representation.
 *
 * - Sections are sorted by numeric `position`.
 * - Lessons within each section are sorted by numeric `position`.
 * - 1-based sequential indices are assigned across the flattened lesson sequence.
 * - A lookup Map<number, CourseLesson> is built, mapping each sequential index
 *   to the original API CourseLesson object (retaining id, description, contentType, etc.).
 * - The original CourseOverviewResponse input is never mutated.
 */
export function adaptCourseOverviewToCurriculum(
  overview: CourseOverviewResponse,
): AdaptedCurriculum {
  const lessonsByNumber = new Map<number, CourseLesson>();

  if (!overview || !Array.isArray(overview.sections)) {
    return {
      sections: [],
      lessonsByNumber,
      totalLessons: 0,
    };
  }

  // Shallow copy before sorting to guarantee no mutation on the original input
  const sortedSections = [...overview.sections].sort(
    (a, b) => a.position - b.position,
  );

  let sequentialIndex = 1;

  const adaptedSections: AdaptedCurriculumSection[] = sortedSections.map(
    (sec, secIdx) => {
      // Shallow copy lessons array before sorting
      const sortedLessons = [...(sec.lessons ?? [])].sort(
        (a, b) => a.position - b.position,
      );

      const adaptedLessons: Lesson[] = sortedLessons.map((les) => {
        const lessonNumber = sequentialIndex++;
        lessonsByNumber.set(lessonNumber, les);

        return [
          lessonNumber,
          les.title,
          formatMediaTime(les.durationSeconds ?? 0),
          "todo" as const,
          les.isPreview,
          les.contentType ?? "video",
        ];
      });

      return {
        id: secIdx + 1,
        sectionId: sec.id,
        title: sec.title,
        progress: `0/${adaptedLessons.length}`,
        lessons: adaptedLessons,
      };
    },
  );

  return {
    sections: adaptedSections,
    lessonsByNumber,
    totalLessons: lessonsByNumber.size,
  };
}
