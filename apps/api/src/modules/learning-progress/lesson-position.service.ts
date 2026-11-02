import type { LearningProgressExecutor } from "./learning-progress.repository.ts";
import * as learningProgressRepository from "./learning-progress.repository.ts";

/**
 * Where a learner last was in one lesson's video, for other modules (the
 * lesson's playback bootstrap starts the video there, on any device). It
 * reads only this module's own table, so it can be used where the full
 * learning-progress service (which reads the curriculum) cannot.
 */
export function createLessonPositionReader({
  database,
}: {
  database: LearningProgressExecutor;
}) {
  return {
    async findLessonPosition(
      userId: string,
      courseId: string,
      lessonId: string,
    ): Promise<{ seconds: number; savedAt: Date } | null> {
      const row = await learningProgressRepository.findLessonPosition(
        database,
        userId,
        courseId,
        lessonId,
      );
      return row &&
        typeof row.position_seconds === "number" &&
        row.position_updated_at
        ? {
            seconds: row.position_seconds,
            savedAt: new Date(row.position_updated_at),
          }
        : null;
    },
  };
}

export type LessonPositionReader = ReturnType<
  typeof createLessonPositionReader
>;
