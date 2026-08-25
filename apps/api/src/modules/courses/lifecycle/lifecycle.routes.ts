import { z } from "zod";
import {
  courseSchema,
  courseValidationResponseSchema,
  courseEditorDataResponseSchema,
} from "@veolms/contracts";

import { errorResponse } from "../../../lib/errors.ts";
import { jsonResponse } from "../../../lib/responses.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";

import { createCoursesContext } from "../shared/courses.context.ts";
import { createLifecycleController } from "./lifecycle.controller.ts";
import { createLifecycleService } from "./lifecycle.service.ts";

const lifecycleRoutes: RoutePlugin = async (app, options) => {
  const ctx = createCoursesContext(options);
  const service = createLifecycleService({
    database: options.database,
    services: options.services,
  });
  const controller = createLifecycleController({ service });

  app.get(
    "/courses/:id/validation",
    {
      schema: {
        operationId: "getCourseValidationIssues",
        tags: ["Course Lifecycle"],
        summary: "Check for configuration gaps before publishing",
        params: z.object({ id: z.uuid() }),
        response: {
          200: jsonResponse(
            "List of validation gaps",
            courseValidationResponseSchema,
          ),
          403: errorResponse("Forbidden - not course owner"),
          404: errorResponse("Course not found"),
        },
      },
      preHandler: ctx.requireCourseAuthor,
    },
    controller.getCourseValidationIssues,
  );

  app.post(
    "/courses/:id/publish",
    {
      schema: {
        operationId: "publishCourse",
        tags: ["Course Lifecycle"],
        summary: "Publish course draft to learners",
        params: z.object({ id: z.uuid() }),
        response: {
          200: jsonResponse("Course published successfully", courseSchema),
          400: errorResponse("Unresolved validation issues block publishing"),
          403: errorResponse("Forbidden - not course owner"),
          404: errorResponse("Course not found"),
          409: errorResponse("Optimistic lock conflict"),
        },
      },
      preHandler: ctx.requireCourseAuthor,
    },
    controller.publishCourse,
  );

  app.post(
    "/courses/:id/unpublish",
    {
      schema: {
        operationId: "unpublishCourse",
        tags: ["Course Lifecycle"],
        summary: "Unpublish a course and return it to draft state",
        params: z.object({ id: z.uuid() }),
        response: {
          200: jsonResponse("Course unpublished", courseSchema),
          403: errorResponse("Forbidden - not course owner"),
          404: errorResponse("Course not found"),
          409: errorResponse("Optimistic lock conflict"),
        },
      },
      preHandler: ctx.requireCourseAuthor,
    },
    controller.unpublishCourse,
  );

  app.get(
    "/courses/:id/preview",
    {
      schema: {
        operationId: "previewCourseDraft",
        tags: ["Course Lifecycle"],
        summary: "Preview draft contents for creator's eye only",
        params: z.object({ id: z.uuid() }),
        response: {
          200: jsonResponse(
            "Course draft preview details",
            courseEditorDataResponseSchema,
          ),
          403: errorResponse("Forbidden - not course owner"),
          404: errorResponse("Course not found"),
        },
      },
      preHandler: ctx.requireCourseAuthor,
    },
    controller.previewCourseDraft,
  );
};

export default lifecycleRoutes;
