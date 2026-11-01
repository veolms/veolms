import type { Database, DatabaseExecutor } from "@veolms/database";
import type { Kysely } from "kysely";
import {
  createQuizCompletionService,
  type QuizCompletionService,
} from "../quizzes/index.ts";
import * as learningProgressRepository from "./learning-progress.repository.ts";

/**
 * What the courses module may ask of learning progress when a lesson's
 * content changes.
 *
 * A lesson with no video is finished by opening it: there is nothing in it
 * to watch. When its creator later attaches a video, the learners who
 * opened it earlier would keep a finished lesson they never watched, and
 * their course would go on counting it. Clearing the lesson's progress at
 * that moment puts those learners back to "not started" on it, so the
 * course percentage drops by that lesson until the video is watched.
 *
 * Learners who have passed the lesson's quiz are the exception: they earned
 * the lesson, and a video added afterwards does not take it back or make
 * them watch it. Their progress on the lesson is left exactly as stored.
 * "Passed" is the quizzes module's own answer, the one `syncProgress` uses
 * to accept a quiz lesson as complete.
 *
 * The caller passes its own executor so the progress goes in the same
 * transaction as the change that attaches the video.
 */
export function createLessonProgressResetService({
  database,
  quizCompletionService = createQuizCompletionService({ database }),
}: {
  database: Kysely<Database>;
  quizCompletionService?: Pick<
    QuizCompletionService,
    "listLearnerIdsWhoPassedLesson"
  >;
}) {
  return {
    /**
     * Clears learners' progress on the lesson, except for those who passed
     * its quiz; returns how many learners were cleared.
     */
    async clearLessonProgress(
      executor: DatabaseExecutor,
      lessonId: string,
    ): Promise<number> {
      const passedLearnerIds =
        await quizCompletionService.listLearnerIdsWhoPassedLesson(
          lessonId,
          executor,
        );
      return await learningProgressRepository.deleteLessonProgress(
        executor,
        lessonId,
        passedLearnerIds,
      );
    },

    /**
     * Clears one learner's progress through a whole course, for an
     * unenrollment that is meant to start them from nothing if they come
     * back. Quizzes passed are not looked at: the learner asked for this.
     */
    async clearCourseProgressForLearner(
      executor: DatabaseExecutor,
      userId: string,
      courseId: string,
    ): Promise<number> {
      return await learningProgressRepository.deleteCourseProgressForUser(
        executor,
        userId,
        courseId,
      );
    },
  };
}

export type LessonProgressResetService = ReturnType<
  typeof createLessonProgressResetService
>;
