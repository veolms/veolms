import { z } from "zod";
import {
  createLessonChapterRequestSchema,
  lessonChapterSchema,
  lessonChaptersListResponseSchema,
  updateLessonChapterRequestSchema,
} from "@veolms/contracts";

import { errorResponse } from "../../../lib/errors.ts";
import { jsonResponse } from "../../../lib/responses.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { createCoursesContext } from "../shared/courses.context.ts";
import { createChaptersController } from "./chapters.controller.ts";
import { createChaptersService } from "./chapters.service.ts";

const chaptersRoutes: RoutePlugin = async (app, options) => {
  const ctx = createCoursesContext(options);
  const service = createChaptersService({
    database: options.database,
    services: options.services,
  });
  const controller = createChaptersController({ service });
  const lessonParams = z.object({ courseId: z.uuid(), lessonId: z.uuid() });
  const chapterParams = z.object({
    courseId: z.uuid(),
    lessonId: z.uuid(),
    chapterId: z.uuid(),
  });
  const authorization = ctx.authorize("lesson.content.update", "lesson");

  app.get(
    "/courses/:courseId/lessons/:lessonId/chapters",
    {
      schema: {
        operationId: "listLessonChapters",
        tags: ["Course Chapters"],
        summary: "List chapters for a lesson",
        params: lessonParams,
        response: {
          200: jsonResponse(
            "List of lesson chapters",
            lessonChaptersListResponseSchema,
          ),
          403: errorResponse("Forbidden - not permitted"),
          404: errorResponse("Lesson not found"),
        },
      },
      preHandler: authorization,
    },
    controller.listChapters,
  );

  app.post(
    "/courses/:courseId/lessons/:lessonId/chapters",
    {
      schema: {
        operationId: "createLessonChapter",
        tags: ["Course Chapters"],
        summary: "Create a lesson chapter",
        params: lessonParams,
        body: createLessonChapterRequestSchema,
        response: {
          201: jsonResponse("Lesson chapter created", lessonChapterSchema),
          400: errorResponse("Invalid chapter or lesson content type"),
          403: errorResponse("Forbidden - not permitted"),
          404: errorResponse("Lesson or media not found"),
          409: errorResponse("Chapter conflicts with media or another chapter"),
        },
      },
      preHandler: authorization,
    },
    controller.createChapter,
  );

  app.patch(
    "/courses/:courseId/lessons/:lessonId/chapters/:chapterId",
    {
      schema: {
        operationId: "updateLessonChapter",
        tags: ["Course Chapters"],
        summary: "Update a lesson chapter",
        params: chapterParams,
        body: updateLessonChapterRequestSchema,
        response: {
          200: jsonResponse("Lesson chapter updated", lessonChapterSchema),
          400: errorResponse("Invalid chapter or chapter timestamp"),
          403: errorResponse("Forbidden - not permitted"),
          404: errorResponse("Lesson or chapter not found"),
          409: errorResponse("Chapter conflicts with media or another chapter"),
        },
      },
      preHandler: authorization,
    },
    controller.updateChapter,
  );

  app.delete(
    "/courses/:courseId/lessons/:lessonId/chapters/:chapterId",
    {
      schema: {
        operationId: "deleteLessonChapter",
        tags: ["Course Chapters"],
        summary: "Delete a lesson chapter",
        params: chapterParams,
        response: {
          200: jsonResponse(
            "Lesson chapter deleted",
            z.object({ success: z.boolean() }),
          ),
          403: errorResponse("Forbidden - not permitted"),
          404: errorResponse("Lesson or chapter not found"),
        },
      },
      preHandler: authorization,
    },
    controller.deleteChapter,
  );
};

export default chaptersRoutes;
