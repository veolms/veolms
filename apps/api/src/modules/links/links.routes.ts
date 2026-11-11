import {
  createShortLinkRequestSchema,
  shortLinkListResponseSchema,
  shortLinkPathCheckQuerySchema,
  shortLinkPathCheckResponseSchema,
  shortLinkResolveQuerySchema,
  shortLinkResolveResultSchema,
  shortLinkSchema,
  shortLinkVisitRequestSchema,
  updateShortLinkRequestSchema,
} from "@veolms/contracts";
import { z } from "zod";

import { config } from "../../config.ts";
import { errorResponse } from "../../lib/errors.ts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import { createPermissionPreHandlers } from "../authorization/index.ts";
import { createLinksController } from "./links.controller.ts";
import { createLinksService } from "./links.service.ts";

/**
 * Links: short addresses on the site's own domain (docs/short-links.md).
 * Staff with `link.manage` manage them in Settings > Links; the website
 * Worker resolves them (`/links/resolve`) and counts visits.
 */
const linksRoutes: RoutePlugin = async (app, options) => {
  const { requires } = createPermissionPreHandlers(options.database);
  const service = createLinksService({
    database: options.database,
    config,
    logger: app.log,
  });
  const controller = createLinksController({ service });
  // "platform": an instructor's role counts as well as an admin's.
  const manage = requires("link.manage", "platform");
  const linkParams = z.object({ linkId: z.uuid() });

  app.get(
    "/links",
    {
      preHandler: manage,
      schema: {
        operationId: "listShortLinks",
        tags: ["Links"],
        summary: "List the short links",
        response: {
          200: jsonResponse(
            "Every link, newest first.",
            shortLinkListResponseSchema,
          ),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
        },
      },
    },
    controller.list,
  );

  app.get(
    "/links/check",
    {
      preHandler: manage,
      schema: {
        operationId: "checkShortLinkPath",
        tags: ["Links"],
        summary: "Check whether a path is free",
        description:
          "Refuses the app's own pages, reserved prefixes, usernames and other links, and suggests a free path. Without a path, suggests a short random one.",
        querystring: shortLinkPathCheckQuerySchema,
        response: {
          200: jsonResponse(
            "Whether the path is free.",
            shortLinkPathCheckResponseSchema,
          ),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
        },
      },
    },
    controller.check,
  );

  app.post(
    "/links",
    {
      preHandler: manage,
      schema: {
        operationId: "createShortLink",
        tags: ["Links"],
        summary: "Create a short link",
        body: createShortLinkRequestSchema,
        response: {
          200: jsonResponse("The new link.", shortLinkSchema),
          400: errorResponse("The destination is not allowed"),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
          409: errorResponse(
            "The path is taken; the message suggests a free one",
          ),
        },
      },
    },
    controller.create,
  );

  app.patch(
    "/links/:linkId",
    {
      preHandler: manage,
      schema: {
        operationId: "updateShortLink",
        tags: ["Links"],
        summary: "Change, pause or resume a short link",
        params: linkParams,
        body: updateShortLinkRequestSchema,
        response: {
          200: jsonResponse("The link as saved.", shortLinkSchema),
          400: errorResponse("The destination is not allowed"),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
          404: errorResponse("Link not found"),
          409: errorResponse(
            "The path is taken; the message suggests a free one",
          ),
        },
      },
    },
    controller.update,
  );

  app.delete(
    "/links/:linkId",
    {
      preHandler: manage,
      schema: {
        operationId: "deleteShortLink",
        tags: ["Links"],
        summary: "Delete a short link",
        params: linkParams,
        response: {
          200: jsonResponse("Deleted.", z.object({ deleted: z.literal(true) })),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
          404: errorResponse("Link not found"),
        },
      },
    },
    controller.remove,
  );

  app.get(
    "/links/resolve",
    {
      schema: {
        operationId: "resolveShortLink",
        tags: ["Links"],
        summary: "Look up the link at a path",
        description:
          "Public: the website Worker asks it through Cloudflare's cache. Always 200; `link` is null when there is no active link at the path.",
        querystring: shortLinkResolveQuerySchema,
        response: {
          200: jsonResponse(
            "The active link, or null.",
            shortLinkResolveResultSchema,
          ),
        },
      },
    },
    controller.resolve,
  );

  app.post(
    "/links/visits",
    {
      schema: {
        operationId: "recordShortLinkVisit",
        tags: ["Links"],
        summary: "Count a visit to a link",
        description:
          "Sent by the website Worker after it has answered the visit.",
        body: shortLinkVisitRequestSchema,
        response: {
          200: jsonResponse("Counted.", z.object({ counted: z.literal(true) })),
        },
      },
    },
    controller.visit,
  );
};

export default linksRoutes;
