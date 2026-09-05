import { getLessonSlug, sections } from "./courseContent";

export const PRERENDERED_LEARNING_COURSE_SLUGS = [
  "backend-nodejs",
  "typescript-course",
  "ui-ux-design-mastery",
  "mongodb-database-design",
] as const;

export type LearningPrerenderScope = "first-section" | "all-lectures";

interface CreateLearningPrerenderPathsOptions {
  courseSlugs?: readonly string[];
  scope: LearningPrerenderScope;
}

const getLectureIds = (scope: LearningPrerenderScope) =>
  (scope === "all-lectures" ? sections : sections.slice(0, 1)).flatMap(
    ({ lessons }) => lessons.map(([lessonId]) => lessonId),
  );

export const createLearningPrerenderPaths = ({
  courseSlugs = PRERENDERED_LEARNING_COURSE_SLUGS,
  scope,
}: CreateLearningPrerenderPathsOptions) => {
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
