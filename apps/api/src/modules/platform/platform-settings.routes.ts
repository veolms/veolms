import {
  academyLogoCompleteRequestSchema,
  academyLogoPresignRequestSchema,
  academyLogoPresignResponseSchema,
  platformSettingsResponseSchema,
  publicPlatformSettingsResponseSchema,
  staticSiteRebuildStatusSchema,
  updatePlatformSettingsRequestSchema,
} from "@veolms/contracts";
import { errorResponse } from "../../lib/errors.ts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import { createSessionService } from "../auth/index.ts";
import { createAcademyBrandService } from "../academy/academy-brand.service.ts";
import { createPermissionPreHandlers } from "../authorization/index.ts";
import { createPlatformInvoiceLogoService } from "./platform-invoice-logo.service.ts";
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
    invoiceLogo: createPlatformInvoiceLogoService({
      settings: service,
      brand: createAcademyBrandService({
        database: options.database,
        storage: options.services.storage,
      }),
    }),
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

  app.post(
    "/platform/settings/invoice-logo/presign",
    {
      preHandler: requires("platform.settings.update"),
      schema: {
        operationId: "presignInvoiceLogoUpload",
        tags: ["Platform"],
        summary: "Get an address to upload an invoice-only logo to",
        description:
          "The browser PUTs the PNG or JPEG straight to the returned address, then calls /platform/settings/invoice-logo/complete.",
        body: academyLogoPresignRequestSchema,
        response: {
          200: jsonResponse(
            "Where to upload the logo.",
            academyLogoPresignResponseSchema,
          ),
          400: errorResponse("Not a PNG or JPEG, or larger than 2 MB"),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
          409: errorResponse("The academy has not been set up yet"),
        },
      },
    },
    controller.presignInvoiceLogo,
  );

  app.post(
    "/platform/settings/invoice-logo/complete",
    {
      preHandler: requires("platform.settings.update"),
      schema: {
        operationId: "completeInvoiceLogoUpload",
        tags: ["Platform"],
        summary: "Make an uploaded image the logo printed on invoices",
        body: academyLogoCompleteRequestSchema,
        response: {
          200: jsonResponse(
            "The settings in force after the change.",
            platformSettingsResponseSchema,
          ),
          400: errorResponse("The upload is missing or is not a PNG or JPEG"),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
          503: errorResponse("Settings storage is not available yet"),
        },
      },
    },
    controller.completeInvoiceLogo,
  );

  app.delete(
    "/platform/settings/invoice-logo",
    {
      preHandler: requires("platform.settings.update"),
      schema: {
        operationId: "removeInvoiceLogo",
        tags: ["Platform"],
        summary: "Print the academy's logo on invoices again",
        response: {
          200: jsonResponse(
            "The settings in force after the change.",
            platformSettingsResponseSchema,
          ),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
          503: errorResponse("Settings storage is not available yet"),
        },
      },
    },
    controller.removeInvoiceLogo,
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
