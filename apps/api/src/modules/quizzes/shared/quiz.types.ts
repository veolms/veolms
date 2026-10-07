import type { Kysely } from "kysely";
import { AppError } from "../../../lib/errors.ts";
import type { Database } from "@veolms/database";
import type { AccessService } from "../../access/access.service.ts";
import type { AuthService } from "../../auth/index.ts";
import type { CourseService } from "../../courses/course/course.service.ts";

export interface QuizServiceOptions {
  database: Kysely<Database>;
  getAcademyId: () => Promise<string | null>;
  authService: AuthService;
  courseService: CourseService;
  accessService: AccessService;
}

export interface QuizActor {
  id: string;
  roles: readonly string[];
}
export const isAdmin = (actor: QuizActor) =>
  actor.roles.some((role) => role.toLowerCase() === "admin");

/**
 * Removing an assignment deletes every attempt and score recorded against
 * it. Once learners have attempted the quiz that is refused: grades are a
 * record the learner relies on, and nothing can bring them back.
 */
export function assertNoLearnerAttempts(learnerAttempts: number) {
  if (learnerAttempts === 0) return;
  throw new AppError(
    409,
    "QUIZ_HAS_ATTEMPTS",
    `Learners have already attempted this quiz (${learnerAttempts} attempt${learnerAttempts === 1 ? "" : "s"}). Removing it would delete their answers and scores. To stop new attempts, set an "available until" date instead.`,
  );
}
