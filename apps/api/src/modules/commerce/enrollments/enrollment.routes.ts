import { enrolledCoursesResponseSchema } from "@veolms/contracts";
import { jsonResponse } from "../../../lib/responses.ts";
import { errorResponse } from "../../../lib/errors.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { createCommerceContext } from "../shared/commerce.context.ts";
import { createEnrollmentService } from "./enrollment.service.ts";
import { createEnrollmentController } from "./enrollment.controller.ts";

const enrollmentRoutes: RoutePlugin = async (app, options) => {
  const ctx = createCommerceContext(options);
  const service = createEnrollmentService({ database: options.database });
  const controller = createEnrollmentController({ service });

  // GET /enrollments/courses — List the logged-in student's active enrolled courses
  app.get(
    "/enrollments/courses",
    {
      preHandler: ctx.requireAuthenticated,
      schema: {
        operationId: "listEnrolledCourses",
        tags: ["Commerce - Enrollments"],
        summary: "List enrolled courses",
        description:
          "Returns the authenticated student's active enrolled courses with course details and progress. " +
          "Excludes revoked, refunded, and expired enrollments.",
        response: {
          200: jsonResponse(
            "List of enrolled courses with details",
            enrolledCoursesResponseSchema,
          ),
          401: errorResponse("Unauthorized"),
        },
      },
    },
    controller.listEnrolledCourses,
  );
};

export default enrollmentRoutes;
