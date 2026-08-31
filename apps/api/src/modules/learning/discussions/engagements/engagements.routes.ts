import { z } from "zod";
import {
  lockThreadRequestSchema,
  lockThreadResponseSchema,
  searchMentionsQuerySchema,
  searchMentionsResponseSchema,
  toggleBookmarkResponseSchema,
  toggleFollowResponseSchema,
  toggleLikeRequestSchema,
  toggleLikeResponseSchema,
} from "@veolms/contracts";
import { errorResponse } from "../../../../lib/errors.ts";
import { jsonResponse } from "../../../../lib/responses.ts";
import type { RoutePlugin } from "../../../../lib/route-plugin.ts";
import { createDiscussionPermissions } from "../shared/discussion.permissions.ts";
import { createRepliesRepository } from "../replies/replies.repository.ts";
import { createThreadsRepository } from "../threads/threads.repository.ts";
import { createEngagementsController } from "./engagements.controller.ts";
import { createEngagementsRepository } from "./engagements.repository.ts";
import { createEngagementsService } from "./engagements.service.ts";

const engagementsRoutes: RoutePlugin = async (app, options) => {
  const permissions = createDiscussionPermissions(options);
  const threadsRepo = createThreadsRepository();
  const repliesRepo = createRepliesRepository();
  const engagementsRepo = createEngagementsRepository();
  const service = createEngagementsService({
    threadsRepo,
    repliesRepo,
    engagementsRepo,
  });
  const controller = createEngagementsController({
    database: options.database,
    service,
  });

  // 1. POST /interactions/likes - Toggle like on thread or reply
  app.post(
    "/interactions/likes",
    {
      preHandler: permissions.requireAuthenticated,
      schema: {
        operationId: "toggleLearningLike",
        tags: ["Learning Engagements"],
        summary: "Toggle like on a discussion thread or reply",
        body: toggleLikeRequestSchema,
        response: {
          200: jsonResponse("Like state toggled", toggleLikeResponseSchema),
          401: errorResponse("Unauthorized"),
          404: errorResponse("Discussion thread or reply not found"),
        },
      },
    },
    controller.toggleLike,
  );

  // 2. POST /threads/:threadId/bookmark - Toggle bookmark/saved
  app.post(
    "/threads/:threadId/bookmark",
    {
      preHandler: permissions.requireAuthenticated,
      schema: {
        operationId: "toggleLearningBookmark",
        tags: ["Learning Engagements"],
        summary: "Save or unsave a discussion thread",
        params: z.object({ threadId: z.uuid() }),
        response: {
          200: jsonResponse(
            "Bookmark state toggled",
            toggleBookmarkResponseSchema,
          ),
          401: errorResponse("Unauthorized"),
          404: errorResponse("Discussion thread not found"),
        },
      },
    },
    controller.toggleBookmark,
  );

  // 3. POST /threads/:threadId/follow - Toggle follow
  app.post(
    "/threads/:threadId/follow",
    {
      preHandler: permissions.requireAuthenticated,
      schema: {
        operationId: "toggleLearningFollow",
        tags: ["Learning Engagements"],
        summary: "Follow or unfollow updates for a discussion thread",
        params: z.object({ threadId: z.uuid() }),
        response: {
          200: jsonResponse("Follow state toggled", toggleFollowResponseSchema),
          401: errorResponse("Unauthorized"),
          404: errorResponse("Discussion thread not found"),
        },
      },
    },
    controller.toggleFollow,
  );

  // 4. POST /threads/:threadId/lock - Lock/unlock thread
  app.post(
    "/threads/:threadId/lock",
    {
      preHandler: permissions.requireAuthenticated,
      schema: {
        operationId: "lockLearningThread",
        tags: ["Learning Engagements"],
        summary: "Lock or unlock a discussion thread",
        params: z.object({ threadId: z.uuid() }),
        body: lockThreadRequestSchema,
        response: {
          200: jsonResponse("Lock status updated", lockThreadResponseSchema),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden - Author or moderator only"),
          404: errorResponse("Discussion thread not found"),
        },
      },
    },
    controller.lockThread,
  );

  // 5. GET /interactions/users/autocomplete - Autocomplete users for @mentions
  app.get(
    "/interactions/users/autocomplete",
    {
      preHandler: permissions.requireAuthenticated,
      schema: {
        operationId: "autocompleteUsersForMention",
        tags: ["Learning Engagements"],
        summary: "Search course participants for @mentions",
        querystring: searchMentionsQuerySchema,
        response: {
          200: jsonResponse(
            "List of matching users",
            searchMentionsResponseSchema,
          ),
          400: errorResponse("Query and courseId are required"),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden - No course access"),
          404: errorResponse("Course not found"),
        },
      },
    },
    controller.searchMentions,
  );
};

export default engagementsRoutes;
