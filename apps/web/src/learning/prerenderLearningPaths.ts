import { getLessonSlug } from "./courseContent";
import { CURRICULUM_LECTURE_COUNT_DEFAULT } from "./curriculumSize";

export const PRERENDERED_LEARNING_COURSE_SLUGS = [
  "backend-nodejs",
  "complete-backend-development-with-nodejs",
  "typescript-course",
  "ultimate-typescript-course",
  "ui-ux-design-mastery",
  "mongodb-database-design",
] as const;

export type LearningPrerenderScope = "none" | "first-section" | "all-lectures";

interface CreateLearningPrerenderPathsOptions {
  courseSlugs?: readonly string[];
  scope: LearningPrerenderScope;
}

// Lesson routes are numbered (`lecture-N`) and their content is loaded from
// the API at runtime, so prerendering only needs the route shells.
const FIRST_SECTION_LECTURE_COUNT = 5;

const getLectureIds = (scope: Exclude<LearningPrerenderScope, "none">) =>
  Array.from(
    {
      length:
        scope === "all-lectures"
          ? CURRICULUM_LECTURE_COUNT_DEFAULT
          : FIRST_SECTION_LECTURE_COUNT,
    },
    (_, index) => index + 1,
  );

export const createLearningPrerenderPaths = ({
  courseSlugs = PRERENDERED_LEARNING_COURSE_SLUGS,
  scope,
}: CreateLearningPrerenderPathsOptions) => {
  // `none` skips every learning route, including the course player shells.
  if (scope === "none") return [];

  const lectureIds = getLectureIds(scope);

  return courseSlugs.flatMap((courseSlug) => {
    const encodedCourseSlug = encodeURIComponent(courseSlug);

    return [
      `/learn/${encodedCourseSlug}`,
      ...lectureIds.map(
        (lessonId) =>
          `/learn/${encodedCourseSlug}/${encodeURIComponent(getLessonSlug(lessonId))}`,
      ),
    ];
  });
};
