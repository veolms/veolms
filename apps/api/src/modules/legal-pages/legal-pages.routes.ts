import {
  adminLegalPageListResponseSchema,
  adminLegalPageResponseSchema,
  legalPageResponseSchema,
  legalPageSlugSchema,
  updateLegalPageRequestSchema,
} from "@veolms/contracts";
import { z } from "zod";
import { errorResponse } from "../../lib/errors.ts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import { createPermissionPreHandlers } from "../authorization/index.ts";
import { createLegalPagesController } from "./legal-pages.controller.ts";
import { createLegalPagesService } from "./legal-pages.service.ts";

const slugParams = z.strictObject({ slug: legalPageSlugSchema });

/**
 * The academy's legal and company pages: public to read, rewritten by an
 * administrator on the Platform page.
 */
const legalPagesRoutes: RoutePlugin = async (app, options) => {
  const { requires } = createPermissionPreHandlers(options.database);
  const controller = createLegalPagesController({
    service: createLegalPagesService({ database: options.database }),
  });

  app.get(
    "/legal-pages/:slug",
    {
      schema: {
        operationId: "getLegalPage",
        tags: ["Legal pages"],
        summary: "Get a legal or company page",
        description:
          "The page as visitors read it, with the academy's details filled in. Public.",
        params: slugParams,
        response: {
          200: jsonResponse("The page.", legalPageResponseSchema),
          404: errorResponse("No such page"),
        },
      },
    },
    controller.getPublicPage,
  );

  app.get(
    "/platform/legal-pages",
    {
      preHandler: requires("platform.settings.read"),
      schema: {
        operationId: "listAdminLegalPages",
        tags: ["Legal pages"],
        summary: "List the legal pages for editing",
        response: {
          200: jsonResponse(
            "Every page, whether it was rewritten, and the details it is missing.",
            adminLegalPageListResponseSchema,
          ),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
        },
      },
    },
    controller.listAdminPages,
  );

  app.get(
    "/platform/legal-pages/:slug",
    {
      preHandler: requires("platform.settings.read"),
      schema: {
        operationId: "getAdminLegalPage",
        tags: ["Legal pages"],
        summary: "Get a legal page for editing",
        params: slugParams,
        response: {
          200: jsonResponse(
            "The page's words with their placeholders, and its default.",
            adminLegalPageResponseSchema,
          ),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
          404: errorResponse("No such page"),
        },
      },
    },
    controller.getAdminPage,
  );

  app.put(
    "/platform/legal-pages/:slug",
    {
      preHandler: requires("platform.settings.update"),
      schema: {
        operationId: "saveLegalPage",
        tags: ["Legal pages"],
        summary: "Save a legal page's words",
        params: slugParams,
        body: updateLegalPageRequestSchema,
        response: {
          200: jsonResponse("The page as saved.", adminLegalPageResponseSchema),
          400: errorResponse("Invalid page"),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
          404: errorResponse("No such page"),
          503: errorResponse("Legal pages storage is not available yet"),
        },
      },
    },
    controller.savePage,
  );

  app.delete(
    "/platform/legal-pages/:slug",
    {
      preHandler: requires("platform.settings.update"),
      schema: {
        operationId: "resetLegalPage",
        tags: ["Legal pages"],
        summary: "Restore a legal page's default words",
        params: slugParams,
        response: {
          200: jsonResponse(
            "The page, back on its default.",
            adminLegalPageResponseSchema,
          ),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
          404: errorResponse("No such page"),
        },
      },
    },
    controller.resetPage,
  );
};

export default legalPagesRoutes;
