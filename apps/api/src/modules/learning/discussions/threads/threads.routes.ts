import { z } from "zod";
import {
  createLearningThreadRequestSchema,
  learningThreadSchema,
  learningThreadsListResponseSchema,
  listLearningThreadsQuerySchema,
  updateLearningThreadRequestSchema,
} from "@veolms/contracts";
import { errorResponse } from "../../../../lib/errors.ts";
import { jsonResponse } from "../../../../lib/responses.ts";
import type { RoutePlugin } from "../../../../lib/route-plugin.ts";
import { createDiscussionPermissions } from "../shared/discussion.permissions.ts";
import { createThreadsController } from "./threads.controller.ts";
import { createThreadsRepository } from "./threads.repository.ts";
import { createThreadsService } from "./threads.service.ts";

const threadsRoutes: RoutePlugin = async (app, options) => {
  const permissions = createDiscussionPermissions(options);
  const repository = createThreadsRepository();
  const service = createThreadsService(repository);
  const controller = createThreadsController({
    database: options.database,
    service,
  });

  // 1. GET /courses/:courseId/lessons/:lessonId/threads - List threads for lesson
  app.get(
    "/courses/:courseId/lessons/:lessonId/threads",
    {
      preHandler: permissions.authenticate,
      schema: {
        operationId: "listLessonThreads",
        tags: ["Learning Discussions"],
        summary: "List comments or Q&A questions for a lesson",
        params: z.object({
          courseId: z.uuid(),
          lessonId: z.uuid(),
        }),
        querystring: listLearningThreadsQuerySchema,
        response: {
          200: jsonResponse(
            "List of discussion threads for lesson",
            learningThreadsListResponseSchema,
          ),
          404: errorResponse("Lesson or course not found"),
        },
      },
    },
    controller.listLessonThreads,
  );

  // 2. POST /courses/:courseId/lessons/:lessonId/threads - Create thread for lesson
  app.post(
    "/courses/:courseId/lessons/:lessonId/threads",
    {
      preHandler: permissions.requireAuthenticated,
      schema: {
        operationId: "createLessonThread",
        tags: ["Learning Discussions"],
        summary: "Start a comment or Q&A question on a lesson",
        params: z.object({
          courseId: z.uuid(),
          lessonId: z.uuid(),
        }),
        body: createLearningThreadRequestSchema,
        response: {
          201: jsonResponse("Thread created", learningThreadSchema),
          400: errorResponse("Invalid input"),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden - User participation suspended"),
        },
      },
    },
    controller.createLessonThread,
  );

  // 3. GET /threads - Hub search across discussions and Q&A
  app.get(
    "/threads",
    {
      preHandler: permissions.authenticate,
      schema: {
        operationId: "listHubThreads",
        tags: ["Learning Discussions"],
        summary: "Global/course search across discussion threads",
        querystring: listLearningThreadsQuerySchema,
        response: {
          200: jsonResponse(
            "List of filtered threads",
            learningThreadsListResponseSchema,
          ),
        },
      },
    },
    controller.listHubThreads,
  );

  // 6. GET /threads/:threadId - Get thread details
  app.get(
    "/threads/:threadId",
    {
      preHandler: permissions.authenticate,
      schema: {
        operationId: "getLearningThread",
        tags: ["Learning Discussions"],
        summary: "Get a specific discussion thread with details",
        params: z.object({ threadId: z.uuid() }),
        response: {
          200: jsonResponse("Thread details", learningThreadSchema),
          404: errorResponse("Thread not found"),
        },
      },
    },
    controller.getThread,
  );

  // 7. PATCH /threads/:threadId - Update thread
  app.patch(
    "/threads/:threadId",
    {
      preHandler: permissions.requireAuthenticated,
      schema: {
        operationId: "updateLearningThread",
        tags: ["Learning Discussions"],
        summary: "Update thread content (Author only)",
        params: z.object({ threadId: z.uuid() }),
        body: updateLearningThreadRequestSchema,
        response: {
          200: jsonResponse("Thread updated", learningThreadSchema),
          400: errorResponse("Cannot edit locked thread"),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden - Author only"),
          404: errorResponse("Thread not found"),
        },
      },
    },
    controller.updateThread,
  );

  // 8. DELETE /threads/:threadId - Soft delete thread
  app.delete(
    "/threads/:threadId",
    {
      preHandler: permissions.requireAuthenticated,
      schema: {
        operationId: "deleteLearningThread",
        tags: ["Learning Discussions"],
        summary: "Soft delete a thread (Author or Moderator)",
        params: z.object({ threadId: z.uuid() }),
        response: {
          200: jsonResponse(
            "Thread deleted",
            z.object({ message: z.string() }),
          ),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
          404: errorResponse("Thread not found"),
        },
      },
    },
    controller.deleteThread,
  );
};

export default threadsRoutes;
