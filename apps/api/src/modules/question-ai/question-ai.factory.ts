import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";
import type { RoutePluginOptions } from "../../lib/route-plugin.ts";
import type { AppServices } from "../../services/index.ts";
import { createAccessService } from "../access/access.service.ts";
import { createAiService } from "../ai/index.ts";
import { createAuthContext } from "../auth/shared/auth.context.ts";
import { createCodingAiService } from "../coding-practice/ai/coding-ai.service.ts";
import { createAuthoringService as createCodingAuthoringService } from "../coding-practice/authoring/authoring.service.ts";
import { createCourseService } from "../courses/course/course.service.ts";
import { createLearningActivityCredit } from "../learning-progress/index.ts";
import { createAssignmentService } from "../quizzes/assignments/assignment.service.ts";
import { createAuthoringService as createQuizAuthoringService } from "../quizzes/authoring/authoring.service.ts";
import { createQuestionJobsService } from "./question-jobs.service.ts";
import { createQuizAiService } from "./quiz-ai.service.ts";

/**
 * The quiz AI and the course-wide run, built from the same services the
 * quiz and coding routes use, so every check (permissions, academy,
 * validation) is theirs. Used by the routes and by the background worker.
 */
export function createQuestionAiServices(input: {
  database: Kysely<Database>;
  services: AppServices;
}) {
  const auth = createAuthContext(input as unknown as RoutePluginOptions);
  const courseService = createCourseService({
    database: input.database,
    services: input.services,
  });
  const ai = createAiService({
    database: input.database,
    authService: auth.authService,
  });
  const shared = {
    database: input.database,
    getAcademyId: async () =>
      (await auth.setupService.getAcademy())?.id ?? null,
    authService: auth.authService,
    courseService,
    accessService: createAccessService(),
  };
  const contextDeps = {
    database: input.database,
    storage: input.services.storage ?? null,
    courseService,
  };
  const quizAi = createQuizAiService({ ...contextDeps, ai });
  const codingAi = createCodingAiService({
    database: input.database,
    ai,
    authoring: createCodingAuthoringService({
      ...shared,
      activityCredit: createLearningActivityCredit(),
    }),
    courseService,
  });
  const jobs = createQuestionJobsService({
    ...contextDeps,
    ai,
    quizAi,
    codingAi,
    quizAuthoring: createQuizAuthoringService(shared),
    quizAssignments: createAssignmentService(shared),
  });
  return { ai, quizAi, jobs };
}
