import {
  legalPageChangeResponseSchema,
  legalPageParamsSchema,
  legalPagesResponseSchema,
  publicLegalPageResponseSchema,
  saveLegalPageRequestSchema,
} from "@veolms/contracts";
import { errorResponse } from "../../lib/errors.ts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import { createPermissionPreHandlers } from "../authorization/index.ts";
import { createLegalPagesController } from "./legal-pages.controller.ts";
import { createLegalPagesService } from "./legal-pages.service.ts";

/**
 * The legal and company pages as an administrator rewrote them (Platform →
 * Legal pages). The web build reads each page's saved text to prerender it;
 * administrators list, save and reset them.
 */
const legalPagesRoutes: RoutePlugin = async (app, options) => {
  const { requires } = createPermissionPreHandlers(options.database);
  const controller = createLegalPagesController({
    service: createLegalPagesService({
      database: options.database,
      staticPages: options.services.courseStaticPages,
    }),
  });

  app.get(
    "/legal-pages/:slug",
    {
      schema: {
        operationId: "getPublicLegalPage",
        tags: ["Legal pages"],
        summary: "Get a legal page's saved text",
        description:
          "Public: the web build prerenders the page from it. Null while the page uses its built-in text.",
        params: legalPageParamsSchema,
        response: {
          200: jsonResponse(
            "The page's saved text, or null.",
            publicLegalPageResponseSchema,
          ),
          400: errorResponse("Unknown page"),
        },
      },
    },
    controller.getPublicPage,
  );

  app.get(
    "/platform/legal-pages",
    {
      preHandler: requires("platform.settings.update"),
      schema: {
        operationId: "listLegalPages",
        tags: ["Legal pages"],
        summary: "List the legal pages with saved text",
        response: {
          200: jsonResponse(
            "Every page with saved text; the others use their built-in text.",
            legalPagesResponseSchema,
          ),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
        },
      },
    },
    controller.listPages,
  );

  app.put(
    "/platform/legal-pages/:slug",
    {
      preHandler: requires("platform.settings.update"),
      schema: {
        operationId: "saveLegalPage",
        tags: ["Legal pages"],
        summary: "Save a legal page's text",
        description:
          "Replaces the page's built-in text and starts a rebuild of the public pages, which publishes it.",
        params: legalPageParamsSchema,
        body: saveLegalPageRequestSchema,
        response: {
          200: jsonResponse(
            "The page as saved, and the rebuild that publishes it.",
            legalPageChangeResponseSchema,
          ),
          400: errorResponse("Invalid page"),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
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
        summary: "Bring back a legal page's built-in text",
        params: legalPageParamsSchema,
        response: {
          200: jsonResponse(
            "The page now uses its built-in text.",
            legalPageChangeResponseSchema,
          ),
          400: errorResponse("Unknown page"),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
        },
      },
    },
    controller.resetPage,
  );
};

export default legalPagesRoutes;
