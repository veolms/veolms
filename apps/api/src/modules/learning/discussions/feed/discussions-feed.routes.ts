import { z } from "zod";
import {
  lessonDiscussionsListResponseSchema,
  listLessonDiscussionsQuerySchema,
} from "@veolms/contracts";
import { errorResponse } from "../../../../lib/errors.ts";
import { jsonResponse } from "../../../../lib/responses.ts";
import type { RoutePlugin } from "../../../../lib/route-plugin.ts";
import {
  createDiscussionPermissions,
  type DiscussionPermissionsContext,
} from "../shared/discussion.permissions.ts";
import {
  createLearningDiscussionsFeedService,
  type LearningDiscussionsFeedService,
} from "./discussions-feed.service.ts";

export interface DiscussionsFeedRouteDependencies {
  permissions?: Pick<DiscussionPermissionsContext, "requireAuthenticated">;
  service?: LearningDiscussionsFeedService;
}

export function createDiscussionsFeedRoutes(
  dependencies: DiscussionsFeedRouteDependencies = {},
): RoutePlugin {
  return async (app, options) => {
    const permissions =
      dependencies.permissions ?? createDiscussionPermissions(options);
    const service =
      dependencies.service ?? createLearningDiscussionsFeedService();

    app.get(
      "/courses/:courseId/lessons/:lessonId/discussions",
      {
        preHandler: permissions.requireAuthenticated,
        schema: {
          operationId: "listLessonDiscussions",
          tags: ["Learning Discussions"],
          summary: "List one globally ordered discussion feed for a lesson",
          params: z.object({
            courseId: z.uuid(),
            lessonId: z.uuid(),
          }),
          querystring: listLessonDiscussionsQuerySchema,
          response: {
            200: jsonResponse(
              "Unified lesson discussion feed",
              lessonDiscussionsListResponseSchema,
            ),
            401: errorResponse("Unauthorized"),
            403: errorResponse("Forbidden - No course access"),
            500: errorResponse("Discussion feed hydration failed"),
          },
        },
      },
      async (request, reply) => {
        const user = request.user!;
        const result = await service.list(options.database, {
          courseId: request.params.courseId,
          lessonId: request.params.lessonId,
          actor: { userId: user.id, roles: user.roles },
          query: request.query,
        });
        return reply.send(result);
      },
    );
  };
}

export default createDiscussionsFeedRoutes();
