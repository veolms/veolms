import type { FastifyRequest } from "fastify";
import { normalizeIP } from "@fastify/rate-limit";
import { z } from "zod";
import {
  generateCodingExerciseRequestSchema,
  reviseCodingExerciseRequestSchema,
} from "@veolms/contracts";
import { errorResponse } from "../../../lib/errors.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { createAiService } from "../../ai/index.ts";
import { createAccessService } from "../../access/access.service.ts";
import { createAuthContext } from "../../auth/shared/auth.context.ts";
import { createPermissionPreHandlers } from "../../authorization/index.ts";
import { createCourseService } from "../../courses/course/course.service.ts";
import { createLearningActivityCredit } from "../../learning-progress/index.ts";
import { createAuthoringService } from "../authoring/authoring.service.ts";
import { createCodingAiController } from "./coding-ai.controller.ts";
import { createCodingAiService } from "./coding-ai.service.ts";

const tags = ["Coding practice"];
const errors = {
  400: errorResponse("Invalid request"),
  401: errorResponse("Authentication required"),
  403: errorResponse("Forbidden"),
};

const perUser = (max: number, timeWindow: string) =>
  ({
    max,
    timeWindow,
    hook: "preHandler",
    keyGenerator: (request: FastifyRequest) =>
      request.user?.id ?? normalizeIP(request.ip),
  }) as const;

/** AI writes coding questions (drafts only) for a lecture. */
const codingAiRoutes: RoutePlugin = async (app, options) => {
  const auth = createAuthContext(options);
  const courseService = createCourseService({
    database: options.database,
    services: options.services,
  });
  const shared = {
    database: options.database,
    getAcademyId: async () =>
      (await auth.setupService.getAcademy())?.id ?? null,
    authService: auth.authService,
    courseService,
    accessService: createAccessService(),
    activityCredit: createLearningActivityCredit(),
  };
  const controller = createCodingAiController(
    createCodingAiService({
      database: options.database,
      ai: createAiService({
        database: options.database,
        authService: auth.authService,
      }),
      authoring: createAuthoringService(shared),
      courseService,
    }),
  );
  const { requires } = createPermissionPreHandlers(options.database);

  app.post(
    "/courses/:courseId/coding-exercises/ai",
    {
      config: { rateLimit: perUser(10, "10 minutes") },
      schema: {
        operationId: "generateCodingExercise",
        tags,
        summary: "Let AI write a draft question for a lecture",
        description:
          "Answers with NDJSON: progress lines, then one `done` line (the saved draft) or `error` line (codingAiStreamEventSchema).",
        params: z.object({ courseId: z.uuid() }),
        body: generateCodingExerciseRequestSchema,
        response: errors,
      },
      preHandler: requires("coding.manage", "platform"),
    },
    controller.generate,
  );
  app.post(
    "/coding-exercises/:id/ai/revise",
    {
      config: { rateLimit: perUser(20, "10 minutes") },
      schema: {
        operationId: "reviseCodingExercise",
        tags,
        summary: "Let AI change a question's draft (fix tests, improve)",
        params: z.object({ id: z.uuid() }),
        body: reviseCodingExerciseRequestSchema,
        response: errors,
      },
      preHandler: requires("coding.manage", "platform"),
    },
    controller.revise,
  );
};

export default codingAiRoutes;
