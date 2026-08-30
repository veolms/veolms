import { z } from "zod";
import {
  createLearningThreadRequestSchema,
  learningThreadSchema,
  learningThreadsListResponseSchema,
  listLearningThreadsQuerySchema,
  updateLearningThreadRequestSchema,
} from "@veolms/contracts";
import { errorResponse } from "../../../lib/errors.ts";
import { jsonResponse } from "../../../lib/responses.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { createLearningInteractionsContext } from "../shared/learning-interactions.context.ts";
import { createThreadsController } from "./threads.controller.ts";
import { createThreadsRepository } from "./threads.repository.ts";
import { createThreadsService } from "./threads.service.ts";

const threadsRoutes: RoutePlugin = async (app, options) => {
  const ctx = createLearningInteractionsContext(options);
  const repo = createThreadsRepository();
  const service = createThreadsService(repo);
  const controller = createThreadsController({
    database: options.database,
    service,
  });

  // 1. GET /courses/:courseId/lessons/:lessonId/threads
  app.get(
    "/courses/:courseId/lessons/:lessonId/threads",
    {
      preHandler: ctx.authenticate,
      schema: {
        operationId: "listLessonThreads",
        tags: ["Learning Discussions"],
        summary: "List discussions, questions, and notes for a course lesson",
        params: z.object({
          courseId: z.uuid(),
          lessonId: z.uuid(),
        }),
        querystring: listLearningThreadsQuerySchema,
        response: {
          200: jsonResponse(
            "List of discussion threads",
            learningThreadsListResponseSchema,
          ),
        },
      },
    },
    controller.listLessonThreads,
  );

  // 2. POST /courses/:courseId/lessons/:lessonId/threads
  app.post(
    "/courses/:courseId/lessons/:lessonId/threads",
    {
      preHandler: [ctx.authenticate, ctx.requireAuthenticated],
      schema: {
        operationId: "createLessonThread",
        tags: ["Learning Discussions"],
        summary: "Create a comment, question, or note in a course lesson",
        params: z.object({
          courseId: z.uuid(),
          lessonId: z.uuid(),
        }),
        body: createLearningThreadRequestSchema,
        response: {
          201: jsonResponse("Discussion thread created", learningThreadSchema),
          400: errorResponse("Invalid input or thread locked"),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden - User participation suspended"),
        },
      },
    },
    controller.createThread,
  );

  // 3. GET /learning-threads - List threads across hub
  app.get(
    "/learning-threads",
    {
      preHandler: ctx.authenticate,
      schema: {
        operationId: "listHubThreads",
        tags: ["Learning Discussions"],
        summary: "List discussions across courses for hub view",
        querystring: listLearningThreadsQuerySchema,
        response: {
          200: jsonResponse(
            "List of hub threads",
            learningThreadsListResponseSchema,
          ),
        },
      },
    },
    controller.listHubThreads,
  );

  // 4. GET /learning-threads/:threadId
  app.get(
    "/learning-threads/:threadId",
    {
      preHandler: ctx.authenticate,
      schema: {
        operationId: "getLearningThread",
        tags: ["Learning Discussions"],
        summary: "Get a discussion thread by ID",
        params: z.object({ threadId: z.uuid() }),
        response: {
          200: jsonResponse("Discussion thread details", learningThreadSchema),
          404: errorResponse("Discussion thread not found"),
        },
      },
    },
    controller.getThread,
  );

  // 5. PATCH /learning-threads/:threadId
  app.patch(
    "/learning-threads/:threadId",
    {
      preHandler: [ctx.authenticate, ctx.requireAuthenticated],
      schema: {
        operationId: "updateLearningThread",
        tags: ["Learning Discussions"],
        summary: "Update a discussion thread (Author only)",
        params: z.object({ threadId: z.uuid() }),
        body: updateLearningThreadRequestSchema,
        response: {
          200: jsonResponse("Discussion thread updated", learningThreadSchema),
          400: errorResponse("Invalid input or locked thread"),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden - Author only"),
          404: errorResponse("Discussion thread not found"),
        },
      },
    },
    controller.updateThread,
  );

  // 6. DELETE /learning-threads/:threadId
  app.delete(
    "/learning-threads/:threadId",
    {
      preHandler: [ctx.authenticate, ctx.requireAuthenticated],
      schema: {
        operationId: "deleteLearningThread",
        tags: ["Learning Discussions"],
        summary: "Delete a discussion thread (Author or Moderator)",
        params: z.object({ threadId: z.uuid() }),
        response: {
          200: jsonResponse("Thread deleted", z.object({ message: z.string() })),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
          404: errorResponse("Discussion thread not found"),
        },
      },
    },
    controller.deleteThread,
  );
};

export default threadsRoutes;
