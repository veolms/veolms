import {
  guestHomePageResponseSchema,
  homePageOptionsResponseSchema,
  homePageSettingsResponseSchema,
  updateHomePageSettingsRequestSchema,
} from "@veolms/contracts";
import { errorResponse } from "../../lib/errors.ts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import { createAuthMiddleware } from "../../middlewares/auth.middleware.ts";
import { ADMIN_ROLE, createSessionService } from "../auth/index.ts";
import { createCourseService } from "../courses/course/course.service.ts";
import {
  createAttachmentsRepository,
  createThreadsRepository,
  createThreadsService,
} from "../learning/discussions/index.ts";
import { createHomePageController } from "./home-page.controller.ts";
import { createHomePageService } from "./home-page.service.ts";

const homePageRoutes: RoutePlugin = async (app, options) => {
  const middleware = createAuthMiddleware(
    createSessionService({ database: options.database }),
  );
  const requireAdmin = [
    middleware.authenticate,
    middleware.requireAuthenticated,
    middleware.requireMfaVerified,
    middleware.requireRoles([ADMIN_ROLE]),
  ];

  const service = createHomePageService({
    database: options.database,
    courseService: createCourseService({
      database: options.database,
      services: options.services,
    }),
    threadsService: createThreadsService(
      createThreadsRepository(),
      createAttachmentsRepository(),
    ),
  });
  const controller = createHomePageController({ service });

  app.get(
    "/home/guest-page",
    {
      schema: {
        operationId: "getGuestHomePage",
        tags: ["Home"],
        summary: "Get the signed-out home page",
        description:
          "Returns the configured home page copy with the courses and discussions each section shows. `version` changes whenever the settings are saved.",
        response: {
          200: jsonResponse(
            "The resolved signed-out home page.",
            guestHomePageResponseSchema,
          ),
        },
      },
    },
    controller.getGuestPage,
  );

  app.get(
    "/home/page-settings",
    {
      preHandler: requireAdmin,
      schema: {
        operationId: "getHomePageSettings",
        tags: ["Home"],
        summary: "Get the home page settings",
        response: {
          200: jsonResponse(
            "The saved settings, or the defaults when none were saved.",
            homePageSettingsResponseSchema,
          ),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
        },
      },
    },
    controller.getSettings,
  );

  app.get(
    "/home/page-settings/options",
    {
      preHandler: requireAdmin,
      schema: {
        operationId: "getHomePageSettingsOptions",
        tags: ["Home"],
        summary: "List what the home page settings can choose from",
        description:
          "Returns the published courses and the most active public discussions an admin can feature, pin or hide.",
        response: {
          200: jsonResponse(
            "Selectable courses and discussions.",
            homePageOptionsResponseSchema,
          ),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
        },
      },
    },
    controller.getOptions,
  );

  app.put(
    "/home/page-settings",
    {
      preHandler: requireAdmin,
      schema: {
        operationId: "updateHomePageSettings",
        tags: ["Home"],
        summary: "Save the home page settings",
        body: updateHomePageSettingsRequestSchema,
        response: {
          200: jsonResponse(
            "The saved settings.",
            homePageSettingsResponseSchema,
          ),
          400: errorResponse("Invalid settings"),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
          503: errorResponse("Settings storage is not available yet"),
        },
      },
    },
    controller.updateSettings,
  );
};

export default homePageRoutes;
