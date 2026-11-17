import {
  createMarketingEmailRequestSchema,
  marketingAudienceCountRequestSchema,
  marketingAudienceCountResponseSchema,
  marketingAudienceOptionsResponseSchema,
  marketingAutomationKeySchema,
  marketingAutomationListResponseSchema,
  marketingEmailListResponseSchema,
  marketingEmailSchema,
  marketingCardFillSchema,
  marketingImageCompleteRequestSchema,
  marketingImageCompleteResponseSchema,
  marketingImagePresignRequestSchema,
  marketingImagePresignResponseSchema,
  type MarketingImageCompleteRequest,
  type MarketingImagePresignRequest,
  marketingPreviewRequestSchema,
  marketingPreviewResponseSchema,
  marketingRecipientsQuerySchema,
  marketingRecipientsResponseSchema,
  marketingReportSchema,
  resendMarketingEmailRequestSchema,
  scheduleMarketingEmailRequestSchema,
  setMarketingAutomationActiveRequestSchema,
  updateMarketingEmailRequestSchema,
} from "@veolms/contracts";
import { z } from "zod";

import { errorResponse } from "../../lib/errors.ts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import { createPermissionPreHandlers } from "../authorization/index.ts";
import { createMarketingService } from "./marketing.service.ts";
import { createMarketingMedia } from "./marketing-media.ts";
import { readTrackingToken, TRACKING_PIXEL } from "./marketing-tracking.ts";
import { marketingLinkAt } from "@veolms/services/email";
import { marketingBlocksSchema } from "@veolms/contracts";
import { courseUrl, siteUrl } from "./marketing-render.ts";
import * as repository from "./marketing.repository.ts";

/**
 * Email marketing (creator-features/34-email-marketing-plan.md).
 *
 * Staff with `marketing.manage` write broadcasts, run the ready
 * automations and read their reports under `/marketing`. The open pixel and
 * click links under `/email/o` and `/email/c` are public: their signed
 * token is the proof, as with unsubscribe links.
 */
const marketingRoutes: RoutePlugin = async (app, options) => {
  const { requires } = createPermissionPreHandlers(options.database);
  const service = createMarketingService({
    database: options.database,
    email: options.services.email,
  });
  const media = createMarketingMedia({
    database: options.database,
    services: options.services,
  });
  // Every student of the academy: only academy-wide roles count.
  const manage = requires("marketing.manage", "academy");
  const emailParams = z.object({ emailId: z.uuid() });
  const automationParams = z.object({ key: marketingAutomationKeySchema });
  const tags = ["Marketing"];
  const denied = {
    401: errorResponse("Unauthorized"),
    403: errorResponse("Forbidden"),
  };
  const userIdOf = (request: { user?: { id: string } | null }) =>
    request.user?.id ?? null;

  app.get(
    "/marketing/emails",
    {
      preHandler: manage,
      schema: {
        operationId: "listMarketingEmails",
        tags,
        summary: "List the broadcasts, newest first",
        response: {
          200: jsonResponse(
            "The broadcasts.",
            marketingEmailListResponseSchema,
          ),
          ...denied,
        },
      },
    },
    async () => ({ emails: await service.listBroadcasts() }),
  );

  app.post(
    "/marketing/emails",
    {
      preHandler: manage,
      schema: {
        operationId: "createMarketingEmail",
        tags,
        summary: "Start a new broadcast from a template",
        body: createMarketingEmailRequestSchema,
        response: {
          200: jsonResponse("The new draft.", marketingEmailSchema),
          ...denied,
        },
      },
    },
    async (request) =>
      await service.create(request.body.template, userIdOf(request)),
  );

  app.get(
    "/marketing/emails/:emailId",
    {
      preHandler: manage,
      schema: {
        operationId: "getMarketingEmail",
        tags,
        summary: "One email, broadcast or automation",
        params: emailParams,
        response: {
          200: jsonResponse("The email.", marketingEmailSchema),
          ...denied,
          404: errorResponse("Not found"),
        },
      },
    },
    async (request) => await service.get(request.params.emailId),
  );

  app.patch(
    "/marketing/emails/:emailId",
    {
      preHandler: manage,
      schema: {
        operationId: "updateMarketingEmail",
        tags,
        summary: "Save changes to an email",
        description:
          "A broadcast can change until it starts sending; an automation's email at any time.",
        params: emailParams,
        body: updateMarketingEmailRequestSchema,
        response: {
          200: jsonResponse("The email as saved.", marketingEmailSchema),
          400: errorResponse("Invalid"),
          ...denied,
          404: errorResponse("Not found"),
          409: errorResponse("Already sending"),
        },
      },
    },
    async (request) =>
      await service.update(request.params.emailId, request.body),
  );

  app.post(
    "/marketing/emails/:emailId/duplicate",
    {
      preHandler: manage,
      schema: {
        operationId: "duplicateMarketingEmail",
        tags,
        summary: "Copy a broadcast into a new draft",
        params: emailParams,
        response: {
          200: jsonResponse("The copy.", marketingEmailSchema),
          ...denied,
          404: errorResponse("Not found"),
        },
      },
    },
    async (request) =>
      await service.duplicate(request.params.emailId, userIdOf(request)),
  );

  app.delete(
    "/marketing/emails/:emailId",
    {
      preHandler: manage,
      schema: {
        operationId: "deleteMarketingEmail",
        tags,
        summary: "Delete a broadcast",
        params: emailParams,
        response: {
          200: jsonResponse("Deleted.", z.object({ deleted: z.literal(true) })),
          ...denied,
          404: errorResponse("Not found"),
          409: errorResponse("Sending"),
        },
      },
    },
    async (request) => {
      await service.remove(request.params.emailId);
      return { deleted: true as const };
    },
  );

  app.post(
    "/marketing/emails/:emailId/schedule",
    {
      preHandler: manage,
      schema: {
        operationId: "scheduleMarketingEmail",
        tags,
        summary: "Send a broadcast now or at a set time",
        params: emailParams,
        body: scheduleMarketingEmailRequestSchema,
        response: {
          200: jsonResponse("The scheduled email.", marketingEmailSchema),
          400: errorResponse("Not ready, or nobody to send to"),
          ...denied,
          404: errorResponse("Not found"),
          409: errorResponse("Already sent"),
        },
      },
    },
    async (request) =>
      await service.schedule(request.params.emailId, request.body.sendAt),
  );

  app.post(
    "/marketing/emails/:emailId/cancel",
    {
      preHandler: manage,
      schema: {
        operationId: "cancelMarketingEmail",
        tags,
        summary: "Unschedule a broadcast, or stop one that is sending",
        params: emailParams,
        response: {
          200: jsonResponse("The email.", marketingEmailSchema),
          ...denied,
          404: errorResponse("Not found"),
          409: errorResponse("Nothing to stop"),
        },
      },
    },
    async (request) => await service.cancel(request.params.emailId),
  );

  app.post(
    "/marketing/emails/:emailId/resend",
    {
      preHandler: manage,
      schema: {
        operationId: "resendMarketingEmail",
        tags,
        summary: "A new draft for those who did not open a sent email",
        params: emailParams,
        body: resendMarketingEmailRequestSchema,
        response: {
          200: jsonResponse("The new draft.", marketingEmailSchema),
          ...denied,
          404: errorResponse("Not found"),
          409: errorResponse("Not sent yet"),
        },
      },
    },
    async (request) =>
      await service.resend(
        request.params.emailId,
        request.body.subject,
        userIdOf(request),
      ),
  );

  app.post(
    "/marketing/emails/:emailId/test",
    {
      preHandler: manage,
      schema: {
        operationId: "sendMarketingTestEmail",
        tags,
        summary: "Send the saved email to yourself",
        params: emailParams,
        response: {
          200: jsonResponse("Sent.", z.object({ sentTo: z.string() })),
          400: errorResponse("No email address"),
          ...denied,
          404: errorResponse("Not found"),
          429: errorResponse("Too many tests"),
        },
      },
    },
    async (request) =>
      await service.sendTest(request.params.emailId, userIdOf(request)!),
  );

  app.post(
    "/marketing/preview",
    {
      preHandler: manage,
      schema: {
        operationId: "previewMarketingEmail",
        tags,
        summary: "The email as students will see it",
        body: marketingPreviewRequestSchema,
        response: {
          200: jsonResponse(
            "The rendered email.",
            marketingPreviewResponseSchema,
          ),
          ...denied,
        },
      },
    },
    async (request) => await service.preview(request.body, userIdOf(request)),
  );

  app.post(
    "/marketing/audience/count",
    {
      preHandler: manage,
      schema: {
        operationId: "countMarketingAudience",
        tags,
        summary: "How many people an audience reaches now",
        body: marketingAudienceCountRequestSchema,
        response: {
          200: jsonResponse("The count.", marketingAudienceCountResponseSchema),
          ...denied,
        },
      },
    },
    async (request) => await service.countAudience(request.body.audience),
  );

  app.get(
    "/marketing/audience/options",
    {
      preHandler: manage,
      schema: {
        operationId: "listMarketingAudienceOptions",
        tags,
        summary: "The courses and workshops an audience can name",
        response: {
          200: jsonResponse(
            "The options.",
            marketingAudienceOptionsResponseSchema,
          ),
          ...denied,
        },
      },
    },
    async () => await service.audienceOptions(),
  );

  app.get(
    "/marketing/emails/:emailId/report",
    {
      preHandler: manage,
      schema: {
        operationId: "getMarketingEmailReport",
        tags,
        summary: "An email's results",
        params: emailParams,
        response: {
          200: jsonResponse("The results.", marketingReportSchema),
          ...denied,
          404: errorResponse("Not found"),
        },
      },
    },
    async (request) => await service.report(request.params.emailId),
  );

  app.get(
    "/marketing/emails/:emailId/recipients",
    {
      preHandler: manage,
      schema: {
        operationId: "listMarketingEmailRecipients",
        tags,
        summary: "Who an email went to, page by page",
        params: emailParams,
        querystring: marketingRecipientsQuerySchema,
        response: {
          200: jsonResponse("One page.", marketingRecipientsResponseSchema),
          ...denied,
          404: errorResponse("Not found"),
        },
      },
    },
    async (request) =>
      await service.recipients(request.params.emailId, request.query),
  );

  app.get(
    "/marketing/automations",
    {
      preHandler: manage,
      schema: {
        operationId: "listMarketingAutomations",
        tags,
        summary: "The six ready automations",
        response: {
          200: jsonResponse(
            "The automations.",
            marketingAutomationListResponseSchema,
          ),
          ...denied,
        },
      },
    },
    async () => ({ automations: await service.listAutomations() }),
  );

  app.post(
    "/marketing/automations/:key/email",
    {
      preHandler: manage,
      schema: {
        operationId: "openMarketingAutomation",
        tags,
        summary: "An automation's email, made from its template the first time",
        params: automationParams,
        response: {
          200: jsonResponse("The email.", marketingEmailSchema),
          ...denied,
        },
      },
    },
    async (request) =>
      await service.openAutomation(request.params.key, userIdOf(request)),
  );

  app.post(
    "/marketing/automations/:key/active",
    {
      preHandler: manage,
      schema: {
        operationId: "setMarketingAutomationActive",
        tags,
        summary: "Switch an automation on or off",
        description:
          "Switching on counts only what happens from now on, so nobody gets an email for the past.",
        params: automationParams,
        body: setMarketingAutomationActiveRequestSchema,
        response: {
          200: jsonResponse("The automation's email.", marketingEmailSchema),
          400: errorResponse("The email is not ready"),
          ...denied,
        },
      },
    },
    async (request) =>
      await service.setAutomationActive(
        request.params.key,
        request.body.active,
        userIdOf(request),
      ),
  );

  // --- Tracking (public; the signed token is the proof) ---

  const tokenParams = z.object({ token: z.string().min(10).max(400) });

  app.post(
    "/marketing/images/presign",
    {
      preHandler: manage,
      schema: {
        operationId: "presignMarketingImageUpload",
        tags,
        summary: "Get an address to upload an email image to",
        description:
          "The browser PUTs the image straight to the returned address, then calls /marketing/images/complete.",
        body: marketingImagePresignRequestSchema,
        response: {
          200: jsonResponse(
            "Where to upload the image.",
            marketingImagePresignResponseSchema,
          ),
          400: errorResponse("Not an image, or larger than 5 MB"),
          ...denied,
        },
      },
    },
    async (request) =>
      await media.presignImage(request.body as MarketingImagePresignRequest),
  );

  app.post(
    "/marketing/images/complete",
    {
      preHandler: manage,
      schema: {
        operationId: "completeMarketingImageUpload",
        tags,
        summary: "Check an uploaded email image and get its public address",
        body: marketingImageCompleteRequestSchema,
        response: {
          200: jsonResponse(
            "The image's public address.",
            marketingImageCompleteResponseSchema,
          ),
          400: errorResponse("The upload is missing or is not an image"),
          ...denied,
        },
      },
    },
    async (request) =>
      await media.completeImage(request.body as MarketingImageCompleteRequest),
  );

  const cardParams = z.object({ id: z.uuid() });

  app.get(
    "/marketing/cards/course/:id",
    {
      preHandler: manage,
      schema: {
        operationId: "getMarketingCourseCard",
        tags,
        summary: "A course's title, picture and link, to fill an email card",
        params: cardParams,
        response: {
          200: jsonResponse("The card's words.", marketingCardFillSchema),
          404: errorResponse("No such course"),
          ...denied,
        },
      },
    },
    async (request) =>
      await media.courseCard((request.params as { id: string }).id),
  );

  app.get(
    "/marketing/cards/workshop/:id",
    {
      preHandler: manage,
      schema: {
        operationId: "getMarketingWorkshopCard",
        tags,
        summary: "A workshop's title, date and link, to fill an email card",
        params: cardParams,
        response: {
          200: jsonResponse("The card's words.", marketingCardFillSchema),
          404: errorResponse("No such workshop"),
          ...denied,
        },
      },
    },
    async (request) =>
      await media.workshopCard((request.params as { id: string }).id),
  );

  app.get(
    "/email/o/:token",
    {
      config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
      schema: {
        operationId: "trackMarketingOpen",
        tags,
        summary: "The open pixel of a marketing email",
        params: tokenParams,
      },
    },
    async (request, reply) => {
      const claims = readTrackingToken(request.params.token);
      if (claims?.kind === "open") {
        await repository
          .recordOpen(options.database, claims)
          .catch((error: unknown) =>
            request.log.warn({ err: error }, "Open not recorded"),
          );
      }
      return reply
        .type("image/gif")
        .header("Cache-Control", "no-store, private")
        .send(TRACKING_PIXEL);
    },
  );

  app.get(
    "/email/c/:token",
    {
      config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
      schema: {
        operationId: "trackMarketingClick",
        tags,
        summary: "A tracked link in a marketing email",
        params: tokenParams,
      },
    },
    async (request, reply) => {
      const claims = readTrackingToken(request.params.token);
      const home = siteUrl();
      if (claims?.kind !== "click") return reply.redirect(home, 302);
      const target = await repository.findClickTarget(options.database, claims);
      const blocks = marketingBlocksSchema.safeParse(target?.blocks);
      // The number names a block's own link, or a link in a text block.
      const url = blocks.success
        ? marketingLinkAt(
            blocks.data,
            claims.blockIndex,
            target?.course_slug ? courseUrl(target.course_slug) : home,
          )
        : null;
      if (!url) return reply.redirect(home, 302);
      await repository
        .recordClick(options.database, claims)
        .catch((error: unknown) =>
          request.log.warn({ err: error }, "Click not recorded"),
        );
      return reply
        .header("Cache-Control", "no-store, private")
        .redirect(url, 302);
    },
  );
};

export default marketingRoutes;
