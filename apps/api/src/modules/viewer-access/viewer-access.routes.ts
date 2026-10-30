import { z } from "zod";
import {
  courseAccessListResponseSchema,
  courseAccessResponseSchema,
} from "@veolms/contracts";

import { errorResponse } from "../../lib/errors.ts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import { createAuthMiddleware } from "../../middlewares/auth.middleware.ts";
import { createSessionService } from "../auth/index.ts";
import { createEnrollmentService } from "../commerce/index.ts";
import { createCourseService } from "../courses/index.ts";
import { createLearningProgressService } from "../learning-progress/learning-progress.service.ts";
import { createViewerAccessController } from "./viewer-access.controller.ts";
import { createViewerAccessService } from "./viewer-access.service.ts";

const viewerAccessRoutes: RoutePlugin = async (app, options) => {
  const middleware = createAuthMiddleware(
    createSessionService({ database: options.database }),
  );
  // A session is optional: a visitor who is not signed in is answered as
  // one. A signed-in session must have passed its second factor, as for
  // the course overview.
  const optionalSession = [
    middleware.authenticate,
    middleware.requireMfaVerifiedIfAuthenticated,
  ];

  const courseService = createCourseService({
    database: options.database,
    services: options.services,
  });
  const service = createViewerAccessService({
    database: options.database,
    courseService,
    enrollmentService: createEnrollmentService({
      database: options.database,
      courseService,
    }),
    learningProgressService: createLearningProgressService({
      database: options.database,
      services: options.services,
    }),
  });
  const controller = createViewerAccessController({ service });

  app.get(
    "/courses/access",
    {
      preHandler: optionalSession,
      schema: {
        operationId: "listCourseAccess",
        tags: ["Courses"],
        summary: "What the viewer may do with each published course",
        description:
          "For every published course: whether the viewer may open every lesson (`access`), what they must do to open the rest " +
          "(`lockedLessonsNeed`), whether they are enrolled and how far they are, and the price in force. " +
          "A visitor who is not signed in gets the same answer as any other. The catalogue's cards are drawn from the courses' " +
          "public pages and take their buttons, prices and progress from this. Never cached.",
        response: {
          200: jsonResponse(
            "The viewer's access to every published course.",
            courseAccessListResponseSchema,
          ),
          403: errorResponse("MFA step-up required."),
        },
      },
    },
    controller.listCourseAccess,
  );

  app.get(
    "/courses/:idOrSlug/access",
    {
      preHandler: optionalSession,
      schema: {
        operationId: "getCourseAccess",
        tags: ["Courses"],
        summary: "What the viewer may do with one course",
        description:
          "The course's entry of `/courses/access`, plus who the viewer is to the course (`viewer`: guest, learner or manager), " +
          "where a learner with access carries on (`resume`), and the current `curriculumVersion` of the course's public curriculum. " +
          "Its lessons open by the same rule playback applies, so a lesson shown unlocked plays. " +
          "Found for the viewers the course's overview is found for. Never cached.",
        params: z.object({
          idOrSlug: z
            .string()
            .min(1)
            .max(160)
            .meta({ description: "Course UUID or URL-safe slug." }),
        }),
        response: {
          200: jsonResponse(
            "The viewer's access to the course.",
            courseAccessResponseSchema,
          ),
          404: errorResponse("No course matches for this viewer."),
          403: errorResponse("MFA step-up required."),
        },
      },
    },
    controller.getCourseAccess,
  );
};

export default viewerAccessRoutes;
