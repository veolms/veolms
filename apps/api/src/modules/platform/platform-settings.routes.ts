import {
  platformSettingsResponseSchema,
  publicPlatformSettingsResponseSchema,
  staticSiteRebuildStatusSchema,
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
  const controller = createPlatformSettingsController({
    service,
    staticPages: options.services.courseStaticPages,
  });

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

  app.get(
    "/platform/static-pages",
    {
      preHandler: requires("platform.settings.update"),
      schema: {
        operationId: "getStaticSiteRebuildStatus",
        tags: ["Platform"],
        summary: "Get the state of the last rebuild of all public pages",
        response: {
          200: jsonResponse(
            "The last rebuild this API process started.",
            staticSiteRebuildStatusSchema,
          ),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
        },
      },
    },
    controller.getStaticSiteRebuildStatus,
  );

  app.post(
    "/platform/static-pages/rebuild",
    {
      preHandler: requires("platform.settings.update"),
      schema: {
        operationId: "rebuildStaticSite",
        tags: ["Platform"],
        summary: "Build and deploy every public page again",
        description:
          "Course pages are rebuilt on their own after a course changes; this rebuilds all of them, the lesson pages and the home page, for changes that reach every page (the academy's look, the home page).",
        response: {
          200: jsonResponse(
            "The rebuild, queued or already under way.",
            staticSiteRebuildStatusSchema,
          ),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
        },
      },
    },
    controller.rebuildStaticSite,
  );
};

export default platformSettingsRoutes;
