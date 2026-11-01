import { z } from "zod";
import {
  addLinkedCourseRequestSchema,
  linkedCoursesListResponseSchema,
} from "@veolms/contracts";

import { errorResponse } from "../../../lib/errors.ts";
import { jsonResponse } from "../../../lib/responses.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";

import { createCoursesContext } from "../shared/courses.context.ts";
import { createLinksController } from "./links.controller.ts";
import { createLinksService } from "./links.service.ts";

const linksRoutes: RoutePlugin = async (app, options) => {
  const ctx = createCoursesContext(options);
  const service = createLinksService({ database: options.database });
  const controller = createLinksController({ service });

  app.get(
    "/courses/:id/linked-courses",
    {
      schema: {
        operationId: "listLinkedCourses",
        tags: ["Course Links"],
        summary: "List the courses that come free with a course",
        params: z.object({ id: z.uuid() }),
        response: {
          200: jsonResponse("Linked courses", linkedCoursesListResponseSchema),
          403: errorResponse("Forbidden - not course owner"),
          404: errorResponse("Course not found"),
        },
      },
      preHandler: ctx.authorize("course.pricing.update", "course"),
    },
    controller.listLinkedCourses,
  );

  app.post(
    "/courses/:id/linked-courses",
    {
      schema: {
        operationId: "addLinkedCourse",
        tags: ["Course Links"],
        summary:
          "Link a course: everyone who holds this course gets it as well",
        params: z.object({ id: z.uuid() }),
        body: addLinkedCourseRequestSchema,
        response: {
          200: jsonResponse("Linked courses", linkedCoursesListResponseSchema),
          400: errorResponse("A course cannot be linked to itself"),
          403: errorResponse("Forbidden - not course owner"),
          404: errorResponse("Course not found"),
        },
      },
      preHandler: ctx.authorize("course.pricing.update", "course"),
    },
    controller.addLinkedCourse,
  );

  app.delete(
    "/courses/:id/linked-courses/:linkedCourseId",
    {
      schema: {
        operationId: "removeLinkedCourse",
        tags: ["Course Links"],
        summary:
          "Unlink a course: learners keep it only if they hold it some other way",
        params: z.object({ id: z.uuid(), linkedCourseId: z.uuid() }),
        response: {
          200: jsonResponse("Linked courses", linkedCoursesListResponseSchema),
          403: errorResponse("Forbidden - not course owner"),
          404: errorResponse("Link not found"),
        },
      },
      preHandler: ctx.authorize("course.pricing.update", "course"),
    },
    controller.removeLinkedCourse,
  );
};

export default linksRoutes;
