import {
  analyticsFilterQuerySchema,
  analyticsOverviewResponseSchema,
  dashboardSummaryResponseSchema,
} from "@veolms/contracts";
import { createAuthContext } from "../auth/shared/auth.context.ts";
import {
  createAuthorizationGuard,
  createAuthorizationService,
} from "../authorization/index.ts";
import { createCourseService } from "../courses/course/course.service.ts";
import { createOrderService } from "../commerce/orders/order.service.ts";
import { createEnrollmentService } from "../commerce/enrollments/enrollment.service.ts";
import { createStudentsService } from "../students/students.service.ts";
import { createLearningProgressService } from "../learning-progress/learning-progress.service.ts";
import { errorResponse } from "../../lib/errors.ts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import { createAnalyticsService } from "./analytics.service.ts";
import { createAnalyticsController } from "./analytics.controller.ts";

const analyticsRoutes: RoutePlugin = async (app, options) => {
  const auth = createAuthContext(options);
  const authorizationService = createAuthorizationService(options.database);
  const authGuard = createAuthorizationGuard(authorizationService);
  const courseService = createCourseService({
    database: options.database,
    services: options.services,
  });

  const service = createAnalyticsService({
    database: options.database,
    orderService: createOrderService({ database: options.database }),
    enrollmentService: createEnrollmentService({ database: options.database }),
    studentsService: createStudentsService({ database: options.database }),
    courseService,
    learningProgressService: createLearningProgressService({
      database: options.database,
      services: options.services,
    }),
  });
  const controller = createAnalyticsController({ service });

  const errors = {
    401: errorResponse("Authentication required"),
    403: errorResponse("Forbidden"),
  };

  app.get(
    "/analytics/admin/overview",
    {
      schema: {
        operationId: "getAdminAnalyticsOverview",
        tags: ["Analytics"],
        summary: "Get platform-wide analytics overview",
        description:
          "Revenue, enrollment, and learning-funnel overview metrics across the whole academy, or a single course when ?courseId= is given. Requires the analytics.revenue.read permission.",
        querystring: analyticsFilterQuerySchema,
        response: {
          200: jsonResponse(
            "Admin analytics overview",
            analyticsOverviewResponseSchema,
          ),
          ...errors,
        },
      },
      preHandler: [
        ...auth.mfaVerified,
        authGuard.authorize("analytics.revenue.read", "platform"),
      ],
    },
    controller.adminOverview,
  );

  app.get(
    "/analytics/instructor/overview",
    {
      schema: {
        operationId: "getInstructorAnalyticsOverview",
        tags: ["Analytics"],
        summary: "Get instructor course analytics overview",
        description:
          "Revenue, enrollment, and learning-funnel overview metrics for a specific course (?courseId=) or, with none given, every course the caller owns. Requires the analytics.course.read permission.",
        querystring: analyticsFilterQuerySchema,
        response: {
          200: jsonResponse(
            "Instructor analytics overview",
            analyticsOverviewResponseSchema,
          ),
          ...errors,
        },
      },
      preHandler: [
        ...auth.mfaVerified,
        authGuard.authorize("analytics.course.read", "course"),
      ],
    },
    controller.instructorOverview,
  );

  app.get(
    "/analytics/dashboard",
    {
      schema: {
        operationId: "getDashboardSummary",
        tags: ["Analytics"],
        summary: "Get the dashboard summary",
        description:
          "Returns the four top dashboard card metrics using calendar-month and seven-day comparison windows. Requires analytics.revenue.read or analytics.course.read and scopes the data to the caller's authorized analytics surface.",
        response: {
          200: jsonResponse(
            "Dashboard summary",
            dashboardSummaryResponseSchema,
          ),
          ...errors,
        },
      },
      preHandler: [
        ...auth.mfaVerified,
        authGuard.authorizeAny(
          ["analytics.revenue.read", "analytics.course.read"],
          "platform",
        ),
      ],
    },
    controller.dashboard,
  );
};

export default analyticsRoutes;
