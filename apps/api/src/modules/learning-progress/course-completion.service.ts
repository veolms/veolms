import type { LearningProgressExecutor } from "./learning-progress.repository.ts";
import * as learningProgressRepository from "./learning-progress.repository.ts";

export interface CourseCompletion {
  totalLessons: number;
  completedLessons: number;
  /** Share of the published lessons finished, 0–100, one decimal. */
  percent: number;
}

/**
 * A learner's share of a course's lessons finished, for other modules (the
 * course certificate). Reads only progress and the published lesson list,
 * so it can be used where the full learning-progress service cannot.
 */
export function createCourseCompletionReader({
  database,
}: {
  database: LearningProgressExecutor;
}) {
  return {
    async getCourseCompletion(
      userId: string,
      courseId: string,
    ): Promise<CourseCompletion> {
      const { totalLessons, completedLessons } =
        await learningProgressRepository.countCourseCompletion(
          database,
          userId,
          courseId,
        );
      const percent =
        totalLessons === 0
          ? 0
          : Math.floor((completedLessons / totalLessons) * 1000) / 10;
      return { totalLessons, completedLessons, percent };
    },
  };
}

export type CourseCompletionReader = ReturnType<
  typeof createCourseCompletionReader
>;
