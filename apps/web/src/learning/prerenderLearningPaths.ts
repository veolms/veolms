import { getLessonSlug } from "./courseContent";
import { CURRICULUM_LECTURE_COUNT_MAX } from "./curriculumSize";

export type LearningPrerenderScope = "none" | "first-section" | "all-lectures";

/** The lessons of each course a quick build (`first-section`) is built with. */
const FIRST_SECTION_LECTURE_COUNT = 5;

export interface PrerenderedLearningCourse {
  slug: string;
  /** How many lessons its public curriculum numbers. */
  lessonCount: number;
}

/**
 * The lesson pages a build writes: every lesson of every course in the
 * catalogue (`all-lectures`), each built with its own lesson (see
 * `LessonPageSeed`), or the first few of each for a quicker local build.
 * `/learn/<course>` (the lesson last opened) is built too, without a
 * lesson of its own.
 */
export const createLearningPrerenderPaths = ({
  courses,
  scope,
}: {
  courses: readonly PrerenderedLearningCourse[];
  scope: LearningPrerenderScope;
}) => {
  if (scope === "none") return [];

  return courses.flatMap(({ slug, lessonCount }) => {
    const encodedCourseSlug = encodeURIComponent(slug);
    // Lesson addresses go no higher than the router reads.
    const count = Math.min(
      lessonCount,
      scope === "all-lectures"
        ? CURRICULUM_LECTURE_COUNT_MAX
        : FIRST_SECTION_LECTURE_COUNT,
    );
    return [
      `/learn/${encodedCourseSlug}`,
      ...Array.from(
        { length: count },
        (_, index) =>
          `/learn/${encodedCourseSlug}/${encodeURIComponent(getLessonSlug(index + 1))}`,
      ),
    ];
  });
};
