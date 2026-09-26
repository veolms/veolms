import { z } from "zod";
import { lessonDiscussionCountsResponseSchema } from "@veolms/contracts";
import { errorResponse } from "../../../../lib/errors.ts";
import { jsonResponse } from "../../../../lib/responses.ts";
import type { RoutePlugin } from "../../../../lib/route-plugin.ts";
import { createDiscussionPermissions } from "../shared/discussion.permissions.ts";
import { createLessonDiscussionCountsController } from "./counts.controller.ts";
import { createLessonDiscussionCountsService } from "./counts.service.ts";

const countsRoutes: RoutePlugin = async (app, options) => {
  const permissions = createDiscussionPermissions(options);
  const service = createLessonDiscussionCountsService();
  const controller = createLessonDiscussionCountsController({
    database: options.database,
    service,
  });

  app.get(
    "/courses/:courseId/lessons/:lessonId/discussions/counts",
    {
      preHandler: permissions.requireAuthenticated,
      schema: {
        operationId: "getLessonDiscussionCounts",
        tags: ["Learning Discussions"],
        summary: "Count visible discussion entries for a lesson",
        params: z.object({
          courseId: z.uuid(),
          lessonId: z.uuid(),
        }),
        response: {
          200: jsonResponse(
            "Lesson discussion counts",
            lessonDiscussionCountsResponseSchema,
          ),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden - No course access"),
        },
      },
    },
    controller.getLessonInteractionCounts,
  );
};

export default countsRoutes;
