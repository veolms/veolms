import { DEFAULT_DAILY_GOAL_MINUTES } from "@veolms/contracts";
import type { DatabaseExecutor } from "@veolms/database";
import * as learningProgressRepository from "./learning-progress.repository.ts";

/**
 * What other modules (coding practice) use to count learning that is not a
 * watched video into the learner's day: streak, today's goal, the calendar
 * and the course split. The caller passes its own executor so the credit
 * goes in the same transaction as the work that earned it, and caps the
 * seconds by the time that really passed.
 */
export function createLearningActivityCredit() {
  return {
    async credit(
      executor: DatabaseExecutor,
      input: {
        userId: string;
        courseId: string;
        seconds: number;
        completions: number;
      },
    ) {
      return await learningProgressRepository.accrueDailyActivity(executor, {
        ...input,
        defaultGoalMinutes: DEFAULT_DAILY_GOAL_MINUTES,
      });
    },
    /** The zone the learner's days are counted in (UTC until they set one). */
    async timeZone(executor: DatabaseExecutor, userId: string) {
      const settings =
        await learningProgressRepository.findUserLearningSettings(
          executor,
          userId,
        );
      return settings?.time_zone ?? "UTC";
    },
  };
}

export type LearningActivityCredit = ReturnType<
  typeof createLearningActivityCredit
>;
