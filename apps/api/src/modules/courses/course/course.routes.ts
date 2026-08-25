import { z } from "zod";
import {
  courseSchema,
  courseListResponseSchema,
  courseSlugParamsSchema,
  publicCourseSchema,
  createCourseRequestSchema,
  updateCourseBasicsRequestSchema,
  courseEditorDataResponseSchema,
  myCoursesListResponseSchema,
  courseOverviewSchema,
} from "@veolms/contracts";

import { errorResponse } from "../../../lib/errors.ts";
import { jsonResponse } from "../../../lib/responses.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";

import { createCoursesContext } from "../shared/courses.context.ts";
import { createCourseController } from "./course.controller.ts";
import { createCourseService } from "./course.service.ts";

const courseRoutes: RoutePlugin = async (app, options) => {
  const ctx = createCoursesContext(options);
  const service = createCourseService({
    database: options.database,
    services: options.services,
  });
  const controller = createCourseController({ service });

  // --- Public Catalogue Routes ---

  app.get(
    "/courses",
    {
      schema: {
        operationId: "listCourses",
        tags: ["Courses"],
        summary: "List published courses",
        description:
          "Returns every course with `published` status, oldest first. " +
          "Unpublished courses are never exposed. Supports optional filtering by creatorId.",
        querystring: z.object({
          creatorId: z.uuid().optional(),
        }),
        response: {
          200: jsonResponse(
            "The published course catalogue.",
            courseListResponseSchema,
          ),
        },
      },
    },
    controller.listCourses,
  );

  app.get(
    "/courses/creator/:creatorId",
    {
      schema: {
        operationId: "listCreatorCourses",
        tags: ["Courses"],
        summary: "List available published courses by creator ID",
        description:
          "Returns all available published courses created by the specified author.",
        params: z.object({
          creatorId: z.uuid().meta({ description: "Creator UUID" }),
        }),
        response: {
          200: jsonResponse(
            "Available courses by this creator.",
            myCoursesListResponseSchema,
          ),
        },
      },
    },
    controller.listCreatorCourses,
  );

  app.get(
    "/courses/:slug",
    {
      schema: {
        operationId: "getCourseBySlug",
        tags: ["Courses"],
        summary: "Get a published course by slug",
        description:
          "Returns the full course record for a published course. Unpublished " +
          "and unknown slugs are indistinguishable and both return 404.",
        params: courseSlugParamsSchema,
        response: {
          200: jsonResponse("The requested course.", publicCourseSchema),
          400: errorResponse("The slug is longer than 160 characters."),
          404: errorResponse("No published course matches the slug."),
        },
      },
    },
    controller.getCourseBySlug,
  );

  // --- Course Overview ---

  app.get(
    "/courses/:idOrSlug/overview",
    {
      schema: {
        operationId: "getCourseOverview",
        tags: ["Courses"],
        summary:
          "Get full course overview data for learners and authenticated users",
        description:
          "Returns the course overview including curriculum preview, instructor info, category, pricing, settings, and duration metrics. Can be accessed by any authenticated user role.",
        params: z.object({
          idOrSlug: z
            .string()
            .min(1)
            .max(160)
            .meta({ description: "Course UUID or URL-safe slug." }),
        }),
        response: {
          200: jsonResponse(
            "The full course overview details.",
            courseOverviewSchema,
          ),
          404: errorResponse("No course matches the provided ID or slug."),
        },
      },
      preHandler: ctx.requireAuthenticated,
    },
    controller.getCourseOverview,
  );

  // --- Course Authoring Basics ---

  app.post(
    "/courses",
    {
      schema: {
        operationId: "createCourse",
        tags: ["Course Authoring"],
        summary: "Create a lightweight course draft",
        body: createCourseRequestSchema,
        response: {
          201: jsonResponse("Course draft created", courseSchema),
        },
      },
      preHandler: ctx.requireCourseAuthor,
    },
    controller.createCourse,
  );

  app.get(
    "/courses/mine",
    {
      schema: {
        operationId: "listMyCourses",
        tags: ["Course Authoring"],
        summary: "List all courses owned by the authenticated author",
        response: {
          200: jsonResponse(
            "List of the author's courses",
            myCoursesListResponseSchema,
          ),
        },
      },
      preHandler: ctx.requireCourseAuthor,
    },
    controller.listMyCourses,
  );

  app.get(
    "/courses/:id/editor",
    {
      schema: {
        operationId: "getCourseEditor",
        tags: ["Course Authoring"],
        summary: "Load full course editor state",
        params: z.object({ id: z.uuid() }),
        response: {
          200: jsonResponse(
            "Course editor data",
            courseEditorDataResponseSchema,
          ),
          404: errorResponse("Course not found"),
        },
      },
      preHandler: ctx.requireCourseAuthor,
    },
    controller.getCourseEditor,
  );

  app.patch(
    "/courses/:id/basics",
    {
      schema: {
        operationId: "updateCourseBasics",
        tags: ["Course Authoring"],
        summary:
          "Update basic course details with optimistic concurrency check",
        params: z.object({ id: z.uuid() }),
        body: updateCourseBasicsRequestSchema,
        response: {
          200: jsonResponse("Course basics updated", courseSchema),
          202: jsonResponse(
            "Video processing accepted",
            z.object({
              videoJobId: z.uuid(),
              processingStatus: z.enum([
                "queued",
                "processing",
                "completed",
                "failed",
              ]),
              version: z.number().int(),
            }),
          ),
          409: errorResponse("Optimistic lock conflict"),
        },
      },
      preHandler: ctx.requireCourseAuthor,
    },
    controller.updateCourseBasics,
  );
};

export default courseRoutes;
