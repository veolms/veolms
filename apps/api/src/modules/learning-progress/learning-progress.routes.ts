import {
  learningGoalSettingsResponseSchema,
  learningProgressBatchRequestSchema,
  learningProgressCourseParamsSchema,
  learningProgressResumeContextResponseSchema,
  learningProgressResponseSchema,
  learningProgressSyncResponseSchema,
  learningSummaryResponseSchema,
  updateLearningGoalSettingsRequestSchema,
} from "@veolms/contracts";

import { errorResponse } from "../../lib/errors.ts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import { createAuthMiddleware } from "../../middlewares/auth.middleware.ts";
import { createSessionService } from "../auth/index.ts";
import { createLearningProgressController } from "./learning-progress.controller.ts";
import { createLearningProgressService } from "./learning-progress.service.ts";

const learningProgressRoutes: RoutePlugin = async (app, options) => {
  const sessionService = createSessionService({ database: options.database });
  const middleware = createAuthMiddleware(sessionService);
  const requireAuthenticated = [
    middleware.authenticate,
    middleware.requireAuthenticated,
    middleware.requireMfaVerified,
  ];
  const service = createLearningProgressService({
    database: options.database,
    services: options.services,
  });
  const controller = createLearningProgressController({ service });

  app.get(
    "/learning-progress/:courseKey",
    {
      preHandler: requireAuthenticated,
      schema: {
        operationId: "getLearningProgress",
        tags: ["Learning Progress"],
        summary: "Get the authenticated learner's course progress",
        params: learningProgressCourseParamsSchema,
        response: {
          200: jsonResponse(
            "The learner's course progress.",
            learningProgressResponseSchema,
          ),
          401: errorResponse("Authentication required"),
          403: errorResponse("Course access required"),
          404: errorResponse("Course not found"),
        },
      },
    },
    controller.get,
  );

  app.get(
    "/learning-progress/:courseKey/resume-context",
    {
      preHandler: requireAuthenticated,
      schema: {
        operationId: "getLearningProgressResumeContext",
        tags: ["Learning Progress"],
        summary:
          "Resolve the authenticated learner's resume context for one course",
        params: learningProgressCourseParamsSchema,
        response: {
          200: jsonResponse(
            "The learner's resume context for one course.",
            learningProgressResumeContextResponseSchema,
          ),
          401: errorResponse("Authentication required"),
          403: errorResponse("Course access required"),
          404: errorResponse("Course not found"),
        },
      },
    },
    controller.getResumeContext,
  );

  app.post(
    "/learning-progress/:courseKey/batch",
    {
      preHandler: requireAuthenticated,
      schema: {
        operationId: "syncLearningProgress",
        tags: ["Learning Progress"],
        summary: "Bulk sync the learner's course progress",
        params: learningProgressCourseParamsSchema,
        body: learningProgressBatchRequestSchema,
        response: {
          200: jsonResponse(
            "The learner's course progress was synchronized.",
            learningProgressSyncResponseSchema,
          ),
          400: errorResponse("Invalid progress data"),
          401: errorResponse("Authentication required"),
          403: errorResponse("Course access required"),
          404: errorResponse("Course not found"),
        },
      },
    },
    controller.sync,
  );

  app.get(
    "/learning/summary",
    {
      preHandler: requireAuthenticated,
      schema: {
        operationId: "getLearningSummary",
        tags: ["Learning Progress"],
        summary:
          "Get the learner's daily goal progress, weekly totals, and streaks",
        response: {
          200: jsonResponse(
            "The learner's goal and streak summary.",
            learningSummaryResponseSchema,
          ),
          401: errorResponse("Authentication required"),
        },
      },
    },
    controller.getSummary,
  );

  app.get(
    "/learning/goal-settings",
    {
      preHandler: requireAuthenticated,
      schema: {
        operationId: "getLearningGoalSettings",
        tags: ["Learning Progress"],
        summary: "Get the learner's goal and reminder settings",
        response: {
          200: jsonResponse(
            "The learner's goal and reminder settings.",
            learningGoalSettingsResponseSchema,
          ),
          401: errorResponse("Authentication required"),
        },
      },
    },
    controller.getGoalSettings,
  );

  app.put(
    "/learning/goal-settings",
    {
      preHandler: requireAuthenticated,
      schema: {
        operationId: "updateLearningGoalSettings",
        tags: ["Learning Progress"],
        summary: "Update the learner's goal and reminder settings",
        body: updateLearningGoalSettingsRequestSchema,
        response: {
          200: jsonResponse(
            "The learner's updated goal and reminder settings.",
            learningGoalSettingsResponseSchema,
          ),
          400: errorResponse("Invalid settings"),
          401: errorResponse("Authentication required"),
        },
      },
    },
    controller.updateGoalSettings,
  );
};

export default learningProgressRoutes;
