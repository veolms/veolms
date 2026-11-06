import {
  reorderCoursesRequestSchema,
  reorderCoursesResponseSchema,
} from "@veolms/contracts";
import type { FastifyRequest } from "fastify";

import { errorResponse } from "../../../lib/errors.ts";
import { jsonResponse } from "../../../lib/responses.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";

import { createCoursesContext } from "../shared/courses.context.ts";
import { createCourseOrderService } from "./course-order.service.ts";

const courseOrderRoutes: RoutePlugin = async (app, options) => {
  const ctx = createCoursesContext(options);
  const service = createCourseOrderService({
    database: options.database,
    staticPages: options.services.courseStaticPages,
  });

  app.put(
    "/courses/order",
    {
      schema: {
        operationId: "reorderCourses",
        tags: ["Course Authoring"],
        summary: "Set the order courses are listed in",
        description:
          "Names every listed course (not deleted, not unlisted) once, first to last. Lists across the academy show courses in this order.",
        body: reorderCoursesRequestSchema,
        response: {
          200: jsonResponse("The saved order.", reorderCoursesResponseSchema),
          400: errorResponse("Invalid course list"),
          403: errorResponse(
            "Forbidden - needs course editing on every course",
          ),
          409: errorResponse("The course list changed since it was loaded"),
        },
      },
      // Academy-wide: the order spans every course, so a role over some
      // courses only (an instructor's own) is not enough.
      preHandler: ctx.authorize("course.details.update", "academy"),
    },
    async (request: FastifyRequest<{ Body: { courseIds: string[] } }>) =>
      await service.reorderCourses(request.body.courseIds),
  );
};

export default courseOrderRoutes;
