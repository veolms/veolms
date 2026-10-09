import {
  academyEnrollmentListQuerySchema,
  academyEnrollmentListResponseSchema,
  enrolledCoursesResponseSchema,
  unenrollCourseParamsSchema,
  unenrollCourseResponseSchema,
} from "@veolms/contracts";
import { jsonResponse } from "../../../lib/responses.ts";
import { errorResponse } from "../../../lib/errors.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { createCourseService } from "../../courses/index.ts";
import { createCommerceContext } from "../shared/commerce.context.ts";
import { createEnrollmentService } from "./enrollment.service.ts";
import { createEnrollmentController } from "./enrollment.controller.ts";

const enrollmentRoutes: RoutePlugin = async (app, options) => {
  const ctx = createCommerceContext(options);
  const service = createEnrollmentService({
    database: options.database,
    courseService: createCourseService({
      database: options.database,
      services: options.services,
    }),
  });
  const controller = createEnrollmentController({ service });

  app.get(
    "/enrollments",
    {
      preHandler: ctx.requireStaff,
      schema: {
        operationId: "listAcademyEnrollments",
        tags: ["Commerce - Enrollments"],
        summary: "List recent academy enrollments",
        description:
          "Returns the most recently created enrollment rows visible to academy staff.",
        querystring: academyEnrollmentListQuerySchema,
        response: {
          200: jsonResponse(
            "List of recent academy enrollments",
            academyEnrollmentListResponseSchema,
          ),
          401: errorResponse("Authentication required"),
          403: errorResponse("Forbidden"),
        },
      },
    },
    controller.listAcademyEnrollments,
  );

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

  // DELETE /enrollments/courses/:courseId — Leave a free course
  app.delete(
    "/enrollments/courses/:courseId",
    {
      preHandler: ctx.requireAuthenticated,
      schema: {
        operationId: "unenrollFromCourse",
        tags: ["Commerce - Enrollments"],
        summary: "Unenroll from a free course",
        description:
          "Removes the authenticated student from a free course they enrolled in at no cost. " +
          "Learning progress is kept. Purchased, bundled, and staff-granted enrollments cannot be removed this way.",
        params: unenrollCourseParamsSchema,
        response: {
          200: jsonResponse(
            "The course the student was unenrolled from",
            unenrollCourseResponseSchema,
          ),
          401: errorResponse("Unauthorized"),
          404: errorResponse("Not enrolled in this course"),
          409: errorResponse("This enrollment cannot be removed"),
        },
      },
    },
    controller.unenrollFromCourse,
  );
};

export default enrollmentRoutes;
