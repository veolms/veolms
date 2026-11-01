import {
  learnerHomeQuerySchema,
  learnerHomeResponseSchema,
} from "@veolms/contracts";
import { errorResponse } from "../../lib/errors.ts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import { createAuthMiddleware } from "../../middlewares/auth.middleware.ts";
import { createSessionService } from "../auth/index.ts";
import { createEnrollmentService } from "../commerce/index.ts";
import { createCourseService } from "../courses/index.ts";
import { createLearningProgressService } from "../learning-progress/learning-progress.service.ts";
import { createLearnerHomeController } from "./learner-home.controller.ts";
import { createLearnerHomeService } from "./learner-home.service.ts";

const learnerHomeRoutes: RoutePlugin = async (app, options) => {
  const middleware = createAuthMiddleware(
    createSessionService({ database: options.database }),
  );
  // The same checks the three endpoints this one stands in for make.
  const requireAuthenticated = [
    middleware.authenticate,
    middleware.requireAuthenticated,
    middleware.requireMfaVerified,
  ];

  const service = createLearnerHomeService({
    enrollmentService: createEnrollmentService({
      database: options.database,
      courseService: createCourseService({
        database: options.database,
        services: options.services,
      }),
    }),
    learningProgressService: createLearningProgressService({
      database: options.database,
      services: options.services,
    }),
  });
  const controller = createLearnerHomeController({ service });

  app.get(
    "/home/learner",
    {
      preHandler: requireAuthenticated,
      schema: {
        operationId: "getLearnerHome",
        tags: ["Home"],
        summary: "Get the signed-in learner's home",
        description:
          "Returns what a learner's home is drawn from in one answer: their active enrolments, their goal summary, " +
          "and where they are in the course the home leads with. Each part is what its own endpoint returns " +
          "(`/enrollments/courses`, `/learning/summary`, `/learning-progress/{courseKey}/resume-context`).",
        querystring: learnerHomeQuerySchema,
        response: {
          200: jsonResponse(
            "The learner's enrolments, goal summary and place in the course their home leads with.",
            learnerHomeResponseSchema,
          ),
          401: errorResponse("Authentication required"),
        },
      },
    },
    controller.getLearnerHome,
  );
};

export default learnerHomeRoutes;
