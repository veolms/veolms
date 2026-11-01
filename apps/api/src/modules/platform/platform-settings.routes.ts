import {
  platformSettingsResponseSchema,
  publicPlatformSettingsResponseSchema,
  updatePlatformSettingsRequestSchema,
} from "@veolms/contracts";
import { errorResponse } from "../../lib/errors.ts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import { createSessionService } from "../auth/index.ts";
import { createPermissionPreHandlers } from "../authorization/index.ts";
import { createPlatformSettingsController } from "./platform-settings.controller.ts";
import { createPlatformSettingsService } from "./platform-settings.service.ts";

/**
 * Academy-wide settings for the Platform page: the default appearance and the
 * student sign-in and enrolment rules. Administrators change them; every
 * visitor's browser reads the public copy.
 */
const platformSettingsRoutes: RoutePlugin = async (app, options) => {
  const sessionService = createSessionService({ database: options.database });
  const { requires } = createPermissionPreHandlers(options.database);
  const service = createPlatformSettingsService({
    database: options.database,
    onSecuritySettingsChange: sessionService.forgetCachedAuthContexts,
  });
  const controller = createPlatformSettingsController({ service });

  app.get(
    "/platform/public-settings",
    {
      schema: {
        operationId: "getPublicPlatformSettings",
        tags: ["Platform"],
        summary: "Get the platform settings every visitor follows",
        description:
          "The default appearance and the student sign-in and enrolment rules. Public: the browser needs them before anyone signs in.",
        response: {
          200: jsonResponse(
            "The settings in force.",
            publicPlatformSettingsResponseSchema,
          ),
        },
      },
    },
    controller.getPublicSettings,
  );

  app.get(
    "/platform/settings",
    {
      preHandler: requires("platform.settings.read"),
      schema: {
        operationId: "getPlatformSettings",
        tags: ["Platform"],
        summary: "Get the platform settings",
        response: {
          200: jsonResponse(
            "The settings in force, saved or default.",
            platformSettingsResponseSchema,
          ),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
        },
      },
    },
    controller.getSettings,
  );

  app.patch(
    "/platform/settings",
    {
      preHandler: requires("platform.settings.update"),
      schema: {
        operationId: "updatePlatformSettings",
        tags: ["Platform"],
        summary: "Change platform settings",
        description:
          "Saves the settings named in the body; the others keep their values.",
        body: updatePlatformSettingsRequestSchema,
        response: {
          200: jsonResponse(
            "The settings in force after the change.",
            platformSettingsResponseSchema,
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

export default platformSettingsRoutes;
