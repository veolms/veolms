import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";
import * as repo from "../shared/quiz.repository.ts";

/**
 * What other modules may ask about quiz outcomes. Learning progress uses it
 * to decide whether a quiz lesson is complete, rather than taking the
 * client's word for it.
 */
export function createQuizCompletionService({
  database,
}: {
  database: Kysely<Database>;
}) {
  return {
    /** Of these lessons, the ones whose quiz this learner has passed. */
    async listPassedLessonIds(
      userId: string,
      lessonIds: readonly string[],
    ): Promise<Set<string>> {
      return new Set(
        await repo.listPassedLessonIds(database, userId, lessonIds),
      );
    },
  };
}
export type QuizCompletionService = ReturnType<
  typeof createQuizCompletionService
>;
