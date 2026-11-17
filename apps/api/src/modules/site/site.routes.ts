import {
  createSitePageRequestSchema,
  saveSitePageDraftRequestSchema,
  siteCourseCardsResponseSchema,
  siteLookSchema,
  siteOverviewResponseSchema,
  sitePageResponseSchema,
  sitePageSlugSchema,
  updateSitePageRequestSchema,
} from "@veolms/contracts";
import { z } from "zod";
import { errorResponse } from "../../lib/errors.ts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import { createPermissionPreHandlers } from "../authorization/index.ts";
import { createSiteController } from "./site.controller.ts";
import { createSiteService } from "./site.service.ts";

const pageParams = z.strictObject({ pageId: z.uuid() });
const versionParams = z.strictObject({
  pageId: z.uuid(),
  versionId: z.uuid(),
});

const TAGS = ["Website"];

/**
 * The website builder (creator-features/40): pages built from ready
 * sections, a site-wide theme, drafts, publishing and rollback. Staff
 * who may change platform settings edit it; visitors read the live pages.
 */
const siteRoutes: RoutePlugin = async (app, options) => {
  const { requires } = createPermissionPreHandlers(options.database);
  const controller = createSiteController({
    service: createSiteService({
      database: options.database,
      services: options.services,
    }),
  });
  const canRead = requires("platform.settings.read");
  const canEdit = requires("platform.settings.update");
  const staffErrors = {
    401: errorResponse("Unauthorized"),
    403: errorResponse("Forbidden"),
  };

  app.get(
    "/site/p/:slug",
    {
      schema: {
        operationId: "showSitePage",
        tags: TAGS,
        summary: "A live website page",
        description:
          "HTML, rendered when the page was published. No script; a strict " +
          "Content-Security-Policy. Public.",
        params: z.strictObject({ slug: sitePageSlugSchema }),
      },
    },
    controller.showLivePage,
  );

  app.get(
    "/site",
    {
      preHandler: canRead,
      schema: {
        operationId: "getSiteOverview",
        tags: TAGS,
        summary: "The site's look and its pages",
        response: {
          200: jsonResponse(
            "The look and every page.",
            siteOverviewResponseSchema,
          ),
          ...staffErrors,
        },
      },
    },
    controller.getOverview,
  );

  app.put(
    "/site/look",
    {
      preHandler: canEdit,
      schema: {
        operationId: "saveSiteLook",
        tags: TAGS,
        summary: "Change the site's theme or colour mode",
        description: "Every live page is rendered again with the new look.",
        body: siteLookSchema,
        response: {
          200: jsonResponse("The site as saved.", siteOverviewResponseSchema),
          400: errorResponse("Invalid look"),
          ...staffErrors,
        },
      },
    },
    controller.saveLook,
  );

  app.get(
    "/site/courses",
    {
      preHandler: canRead,
      schema: {
        operationId: "listSiteCourseCards",
        tags: TAGS,
        summary: "Published courses as course cards show them",
        description: "For the editor's preview and its course picker.",
        response: {
          200: jsonResponse("Course cards.", siteCourseCardsResponseSchema),
          ...staffErrors,
        },
      },
    },
    controller.listCourseCards,
  );

  app.post(
    "/site/pages",
    {
      preHandler: canEdit,
      schema: {
        operationId: "createSitePage",
        tags: TAGS,
        summary: "Add a page from a ready template",
        body: createSitePageRequestSchema,
        response: {
          201: jsonResponse("The new page.", sitePageResponseSchema),
          400: errorResponse("Invalid page"),
          ...staffErrors,
          409: errorResponse("Another page uses this address"),
        },
      },
    },
    controller.createPage,
  );

  app.get(
    "/site/pages/:pageId",
    {
      preHandler: canRead,
      schema: {
        operationId: "getSitePage",
        tags: TAGS,
        summary: "A page's draft and versions",
        params: pageParams,
        response: {
          200: jsonResponse("The page.", sitePageResponseSchema),
          ...staffErrors,
          404: errorResponse("No such page"),
        },
      },
    },
    controller.getPage,
  );

  app.patch(
    "/site/pages/:pageId",
    {
      preHandler: canEdit,
      schema: {
        operationId: "updateSitePage",
        tags: TAGS,
        summary: "Rename a page or change its address",
        params: pageParams,
        body: updateSitePageRequestSchema,
        response: {
          200: jsonResponse("The page.", sitePageResponseSchema),
          400: errorResponse("Invalid page"),
          ...staffErrors,
          404: errorResponse("No such page"),
          409: errorResponse("Another page uses this address"),
        },
      },
    },
    controller.updatePage,
  );

  app.put(
    "/site/pages/:pageId/draft",
    {
      preHandler: canEdit,
      schema: {
        operationId: "saveSitePageDraft",
        tags: TAGS,
        summary: "Autosave a page's draft",
        description:
          "Refused with 409 when the draft was saved elsewhere since " +
          "`baseUpdatedAt`.",
        params: pageParams,
        body: saveSitePageDraftRequestSchema,
        response: {
          200: jsonResponse("The page.", sitePageResponseSchema),
          400: errorResponse("Invalid page content"),
          ...staffErrors,
          404: errorResponse("No such page"),
          409: errorResponse("Saved elsewhere since"),
        },
      },
    },
    controller.saveDraft,
  );

  app.post(
    "/site/pages/:pageId/publish",
    {
      preHandler: canEdit,
      schema: {
        operationId: "publishSitePage",
        tags: TAGS,
        summary: "Publish the draft",
        description:
          "Freezes the draft as a new version, renders it to HTML and makes " +
          "it the live page.",
        params: pageParams,
        response: {
          200: jsonResponse("The page.", sitePageResponseSchema),
          ...staffErrors,
          404: errorResponse("No such page"),
          409: errorResponse("The draft changed while publishing"),
        },
      },
    },
    controller.publishPage,
  );

  app.post(
    "/site/pages/:pageId/versions/:versionId/restore",
    {
      preHandler: canEdit,
      schema: {
        operationId: "restoreSitePageVersion",
        tags: TAGS,
        summary: "Put an earlier version live again",
        description: "The draft is left as it is.",
        params: versionParams,
        response: {
          200: jsonResponse("The page.", sitePageResponseSchema),
          ...staffErrors,
          404: errorResponse("No such page or version"),
        },
      },
    },
    controller.restoreVersion,
  );

  app.post(
    "/site/pages/:pageId/unpublish",
    {
      preHandler: canEdit,
      schema: {
        operationId: "unpublishSitePage",
        tags: TAGS,
        summary: "Take a page off the site",
        description: "Its draft and versions are kept.",
        params: pageParams,
        response: {
          200: jsonResponse("The page.", sitePageResponseSchema),
          ...staffErrors,
          404: errorResponse("No such page"),
        },
      },
    },
    controller.unpublishPage,
  );

  app.delete(
    "/site/pages/:pageId",
    {
      preHandler: canEdit,
      schema: {
        operationId: "deleteSitePage",
        tags: TAGS,
        summary: "Delete a page and its versions",
        params: pageParams,
        response: {
          200: jsonResponse("Deleted.", z.object({ deleted: z.literal(true) })),
          ...staffErrors,
          404: errorResponse("No such page"),
        },
      },
    },
    controller.deletePage,
  );
};

export default siteRoutes;
