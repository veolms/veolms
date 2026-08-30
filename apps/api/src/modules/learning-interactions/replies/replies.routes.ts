import { z } from "zod";
import {
  acceptAnswerRequestSchema,
  acceptAnswerResponseSchema,
  createLearningReplyRequestSchema,
  learningRepliesListResponseSchema,
  learningReplySchema,
  listLearningRepliesQuerySchema,
  updateLearningReplyRequestSchema,
} from "@veolms/contracts";
import { errorResponse } from "../../../lib/errors.ts";
import { jsonResponse } from "../../../lib/responses.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { createLearningInteractionsContext } from "../shared/learning-interactions.context.ts";
import { createThreadsRepository } from "../threads/threads.repository.ts";
import { createRepliesController } from "./replies.controller.ts";
import { createRepliesRepository } from "./replies.repository.ts";
import { createRepliesService } from "./replies.service.ts";

const repliesRoutes: RoutePlugin = async (app, options) => {
  const ctx = createLearningInteractionsContext(options);
  const threadsRepo = createThreadsRepository();
  const repliesRepo = createRepliesRepository();
  const service = createRepliesService({ threadsRepo, repliesRepo });
  const controller = createRepliesController({
    database: options.database,
    service,
  });

  // 1. GET /learning-threads/:threadId/replies
  app.get(
    "/learning-threads/:threadId/replies",
    {
      preHandler: ctx.authenticate,
      schema: {
        operationId: "listLearningReplies",
        tags: ["Learning Discussions"],
        summary: "List replies for a discussion thread or question",
        params: z.object({ threadId: z.uuid() }),
        querystring: listLearningRepliesQuerySchema,
        response: {
          200: jsonResponse(
            "List of replies",
            learningRepliesListResponseSchema,
          ),
          404: errorResponse("Discussion thread not found"),
        },
      },
    },
    controller.listReplies,
  );

  // 2. POST /learning-threads/:threadId/replies
  app.post(
    "/learning-threads/:threadId/replies",
    {
      preHandler: [ctx.authenticate, ctx.requireAuthenticated],
      schema: {
        operationId: "createLearningReply",
        tags: ["Learning Discussions"],
        summary: "Add a reply to a discussion or answer to a Q&A question",
        params: z.object({ threadId: z.uuid() }),
        body: createLearningReplyRequestSchema,
        response: {
          201: jsonResponse("Reply created", learningReplySchema),
          400: errorResponse("Invalid input or locked discussion"),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden - User participation suspended"),
          404: errorResponse("Discussion thread not found"),
        },
      },
    },
    controller.createReply,
  );

  // 3. PATCH /learning-replies/:replyId
  app.patch(
    "/learning-replies/:replyId",
    {
      preHandler: [ctx.authenticate, ctx.requireAuthenticated],
      schema: {
        operationId: "updateLearningReply",
        tags: ["Learning Discussions"],
        summary: "Update a reply (Author only)",
        params: z.object({ replyId: z.uuid() }),
        body: updateLearningReplyRequestSchema,
        response: {
          200: jsonResponse("Reply updated", learningReplySchema),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden - Author only"),
          404: errorResponse("Reply not found"),
        },
      },
    },
    controller.updateReply,
  );

  // 4. DELETE /learning-replies/:replyId
  app.delete(
    "/learning-replies/:replyId",
    {
      preHandler: [ctx.authenticate, ctx.requireAuthenticated],
      schema: {
        operationId: "deleteLearningReply",
        tags: ["Learning Discussions"],
        summary: "Delete a reply (Author or Moderator)",
        params: z.object({ replyId: z.uuid() }),
        response: {
          200: jsonResponse("Reply deleted", z.object({ message: z.string() })),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
          404: errorResponse("Reply not found"),
        },
      },
    },
    controller.deleteReply,
  );

  // 5. POST /learning-threads/:threadId/accept-answer
  app.post(
    "/learning-threads/:threadId/accept-answer",
    {
      preHandler: [ctx.authenticate, ctx.requireAuthenticated],
      schema: {
        operationId: "acceptLearningAnswer",
        tags: ["Learning Discussions"],
        summary: "Mark or unmark an answer as accepted for a Q&A question",
        params: z.object({ threadId: z.uuid() }),
        body: acceptAnswerRequestSchema,
        response: {
          200: jsonResponse("Accepted answer updated", acceptAnswerResponseSchema),
          400: errorResponse("Not a question or invalid reply"),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden - Question author or moderator only"),
          404: errorResponse("Thread or reply not found"),
        },
      },
    },
    controller.acceptAnswer,
  );
};

export default repliesRoutes;
