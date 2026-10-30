import { z } from "zod";
import {
  courseSchema,
  courseBasicsAcceptedResponseSchema,
  courseBasicsResponseSchema,
  courseCreatedResponseSchema,
  courseListResponseSchema,
  courseListQuerySchema,
  courseOptionsResponseSchema,
  courseSlugParamsSchema,
  publicCourseSchema,
  createCourseRequestSchema,
  creatorCoursesListResponseSchema,
  updateCourseBasicsRequestSchema,
  courseEditorDataResponseSchema,
  myCoursesListResponseSchema,
  courseOverviewSchema,
  coursePublicCurriculumSchema,
  lessonDescriptionParamsSchema,
  lessonDescriptionResponseSchema,
  courseDeleteResponseSchema,
  courseStaticPageRefreshStatusResponseSchema,
  heroVideoPlaybackSchema,
  videoPlaybackTokenSchema,
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
  const controller = createCourseController({
    service,
    staticPages: options.services.courseStaticPages,
  });

  app.get(
    "/courses/:id/static-page-refresh",
    {
      schema: {
        operationId: "getCourseStaticPageRefreshStatus",
        tags: ["Course Authoring"],
        summary: "Get public course page refresh status",
        params: z.object({ id: z.uuid() }),
        response: {
          200: jsonResponse(
            "Current public page refresh status.",
            courseStaticPageRefreshStatusResponseSchema,
          ),
        },
      },
      preHandler: ctx.authorize("course.details.update", "course"),
    },
    controller.getStaticPageRefreshStatus,
  );

  app.post(
    "/courses/:id/static-page-refresh/retry",
    {
      schema: {
        operationId: "retryCourseStaticPageRefresh",
        tags: ["Course Authoring"],
        summary: "Retry a failed public course page refresh",
        params: z.object({ id: z.uuid() }),
        response: {
          200: jsonResponse(
            "Queued public page refresh retry.",
            courseStaticPageRefreshStatusResponseSchema,
          ),
        },
      },
      preHandler: ctx.authorize("course.details.update", "course"),
    },
    controller.retryStaticPageRefresh,
  );

  // --- Public Catalogue Routes ---

  app.get(
    "/courses",
    {
      schema: {
        operationId: "listCourses",
        tags: ["Courses"],
        summary: "List published courses",
        description:
          "Returns published courses in stable catalogue order. Unpublished courses are never exposed. " +
          "Use limit and cursor for incremental catalogue loading; supports creatorId, search, and title sorting.",
        querystring: courseListQuerySchema,
        response: {
          200: jsonResponse(
            "The published course catalogue.",
            courseListResponseSchema,
          ),
          403: errorResponse("MFA step-up required."),
        },
      },
      preHandler: [
        ctx.middleware.authenticate,
        ctx.middleware.requireMfaVerifiedIfAuthenticated,
      ],
    },
    controller.listCourses,
  );

  app.get(
    "/courses/options",
    {
      schema: {
        operationId: "listCourseOptions",
        tags: ["Courses"],
        summary: "List published course filter options",
        description:
          "Returns only IDs and titles for published courses, for course filter controls.",
        response: {
          200: jsonResponse(
            "Published course IDs and titles.",
            courseOptionsResponseSchema,
          ),
          403: errorResponse("MFA step-up required."),
        },
      },
      preHandler: [
        ctx.middleware.authenticate,
        ctx.middleware.requireMfaVerifiedIfAuthenticated,
      ],
    },
    controller.listCourseOptions,
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
            creatorCoursesListResponseSchema,
          ),
          403: errorResponse("MFA step-up required."),
        },
      },
      preHandler: [
        ctx.middleware.authenticate,
        ctx.middleware.requireMfaVerifiedIfAuthenticated,
      ],
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
          403: errorResponse("MFA step-up required."),
        },
      },
      preHandler: [
        ctx.middleware.authenticate,
        ctx.middleware.requireMfaVerifiedIfAuthenticated,
      ],
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
          "Get full course overview data for learners and public visitors",
        description:
          "Returns the published course overview including its curriculum, instructor info, category, pricing, settings, and duration metrics. Authentication is optional for anonymous visitors; authenticated sessions must complete MFA before accessing it. Unpublished courses remain private.",
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
          403: errorResponse("MFA step-up required."),
        },
      },
      // Parse an optional session so owners/admins can still preview their
      // unpublished courses while anonymous visitors can view published ones.
      preHandler: [
        ctx.middleware.authenticate,
        ctx.middleware.requireMfaVerifiedIfAuthenticated,
      ],
    },
    controller.getCourseOverview,
  );

  const trailerParams = z.object({
    idOrSlug: z
      .string()
      .min(1)
      .max(160)
      .meta({ description: "Course UUID or URL-safe slug." }),
  });
  // Who may see the overview may play its trailer: everyone on a published
  // course, those who manage it on a draft.
  const trailerPreHandler = [
    ctx.middleware.authenticate,
    ctx.middleware.requireMfaVerifiedIfAuthenticated,
  ];

  app.get(
    "/courses/:idOrSlug/trailer/playback",
    {
      schema: {
        operationId: "getCourseTrailerPlayback",
        tags: ["Courses"],
        summary: "Get what is needed to stream a course's trailer",
        params: trailerParams,
        response: {
          200: jsonResponse(
            "The trailer's stream and segment token.",
            heroVideoPlaybackSchema,
          ),
          404: errorResponse("No course, or the course has no trailer."),
          409: errorResponse("The trailer is still being prepared."),
        },
      },
      preHandler: trailerPreHandler,
    },
    controller.getCourseTrailerPlayback,
  );

  app.get(
    "/courses/:idOrSlug/trailer/playback-token",
    {
      schema: {
        operationId: "getCourseTrailerPlaybackToken",
        tags: ["Courses"],
        summary: "Renew the segment token of a course's trailer",
        params: trailerParams,
        response: {
          200: jsonResponse("A fresh segment token.", videoPlaybackTokenSchema),
          404: errorResponse("No course, or the course has no trailer."),
          409: errorResponse("The trailer is still being prepared."),
        },
      },
      preHandler: trailerPreHandler,
    },
    controller.getCourseTrailerPlaybackToken,
  );

  app.get(
    "/courses/:idOrSlug/curriculum",
    {
      schema: {
        operationId: "getCoursePublicCurriculum",
        tags: ["Courses"],
        summary: "Get a published course as every visitor sees it",
        description:
          "Returns what a published course's pages show everyone: its details, published curriculum, settings and what is included, " +
          "the same for whoever asks and without the price (read it from `/courses/{idOrSlug}/access`). " +
          "A lesson's text is included only where every visitor may read it, and attachments are counted but not named. " +
          "`version` changes whenever any of it does. A course that is not published is not found, whoever asks. " +
          "The course pages are built from this; a page that was built before the course last changed reads it again.",
        params: z.object({
          idOrSlug: z
            .string()
            .min(1)
            .max(160)
            .meta({ description: "Course UUID or URL-safe slug." }),
        }),
        response: {
          200: jsonResponse(
            "The course as every visitor sees it.",
            coursePublicCurriculumSchema,
          ),
          404: errorResponse("No published course matches."),
        },
      },
    },
    controller.getPublicCurriculum,
  );

  app.get(
    "/courses/:courseId/lessons/:lessonId/description",
    {
      schema: {
        operationId: "getLessonDescription",
        tags: ["Courses"],
        summary: "Get one lesson's description",
        description:
          "Returns the description of a lesson the course overview lists for this viewer: a published lesson of a published course for anyone, and any lesson for the course's creator or an admin. Any other lesson is not found. A listed lesson is read by whoever may play it: a visitor who must sign in first gets 401, a learner without the course 403.",
        params: lessonDescriptionParamsSchema,
        response: {
          200: jsonResponse(
            "The lesson's description.",
            lessonDescriptionResponseSchema,
          ),
          401: errorResponse("Sign in to read this lesson."),
          404: errorResponse("No such course or lesson for this viewer."),
          403: errorResponse(
            "MFA step-up required, or the viewer does not have the course.",
          ),
        },
      },
      // The same optional session as the overview.
      preHandler: [
        ctx.middleware.authenticate,
        ctx.middleware.requireMfaVerifiedIfAuthenticated,
      ],
    },
    controller.getLessonDescription,
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
          201: jsonResponse(
            "Course draft created",
            courseCreatedResponseSchema,
          ),
        },
      },
      preHandler: ctx.authorize("course.create", "platform"),
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
      // Authoring-surface route: previously any authenticated account could
      // call it (students merely got an empty list, but the route belongs
      // to the authoring permission surface like its siblings).
      preHandler: ctx.authorize("course.read"),
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
      preHandler: ctx.authorize("course.read", "course"),
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
          200: jsonResponse(
            "Course basics updated",
            courseBasicsResponseSchema,
          ),
          202: jsonResponse(
            "Video processing accepted",
            courseBasicsAcceptedResponseSchema,
          ),
          409: errorResponse("Optimistic lock conflict"),
        },
      },
      preHandler: ctx.authorize("course.details.update", "course"),
    },
    controller.updateCourseBasics,
  );

  app.patch(
    "/courses/:id/details",
    {
      schema: {
        operationId: "updateCourseDetails",
        tags: ["Course Authoring"],
        summary: "Update course metadata details",
        params: z.object({ id: z.uuid() }),
        body: z.object({
          title: z.string().min(1).max(200).optional(),
          subtitle: z.string().max(500).optional().nullable(),
          description: z.string().max(20000).optional().nullable(),
          language: z.string().max(10).optional(),
          level: z
            .enum(["beginner", "intermediate", "advanced", "all_levels"])
            .optional(),
          categoryId: z.string().uuid().optional().nullable(),
          // The course version the caller last read. When sent, the update
          // is refused if the course has changed since.
          version: z.number().int().positive().optional(),
        }),
        response: {
          200: jsonResponse("Course details updated", courseSchema),
          403: errorResponse("Forbidden - not permitted"),
          404: errorResponse("Course not found"),
          409: errorResponse("Optimistic lock conflict"),
        },
      },
      preHandler: ctx.authorize("course.details.update", "course"),
    },
    controller.updateCourseDetails,
  );

  app.patch(
    "/courses/:id/thumbnail",
    {
      schema: {
        operationId: "updateCourseThumbnail",
        tags: ["Course Authoring"],
        summary: "Update course thumbnail only",
        params: z.object({ id: z.uuid() }),
        body: z
          .object({
            thumbnailUrl: z.string().url().max(2048),
            thumbnailMediaId: z.string().uuid().optional().nullable(),
            version: z.number().int().positive().optional(),
          })
          .strict(),
        response: {
          200: jsonResponse("Course thumbnail updated", courseSchema),
          403: errorResponse("Forbidden - not permitted"),
          404: errorResponse("Course not found"),
          409: errorResponse("Optimistic lock conflict"),
        },
      },
      preHandler: ctx.authorize("course.thumbnail.update", "course"),
    },
    controller.updateCourseThumbnail,
  );

  app.post(
    "/courses/:id/archive",
    {
      schema: {
        operationId: "archiveCourse",
        tags: ["Course Authoring"],
        summary: "Archive a course",
        params: z.object({ id: z.uuid() }),
        response: {
          200: jsonResponse("Course archived", courseSchema),
          403: errorResponse("Forbidden - not permitted"),
          404: errorResponse("Course not found"),
        },
      },
      preHandler: ctx.authorize("course.archive", "course"),
    },
    controller.archiveCourse,
  );

  app.delete(
    "/courses/:id",
    {
      schema: {
        operationId: "deleteCourse",
        tags: ["Course Authoring"],
        summary: "Soft delete a course",
        params: z.object({ id: z.uuid() }),
        response: {
          200: jsonResponse("Course deleted", courseDeleteResponseSchema),
          403: errorResponse("Forbidden - not permitted"),
          404: errorResponse("Course not found"),
        },
      },
      preHandler: ctx.authorize("course.delete", "course"),
    },
    controller.deleteCourse,
  );
};

export default courseRoutes;
