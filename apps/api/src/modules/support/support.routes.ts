import fastifyMultipart from "@fastify/multipart";
import { normalizeIP } from "@fastify/rate-limit";
import {
  SUPPORT_ATTACHMENT_MAX_BYTES,
  createSupportMessageRequestSchema,
  createSupportTicketRequestSchema,
  createSupportTicketResponseSchema,
  pinSupportNoteRequestSchema,
  supportAdminListQuerySchema,
  supportNoteParamsSchema,
  supportTeamResponseSchema,
  updateSupportNoteRequestSchema,
  supportAdminListResponseSchema,
  supportAdminStatsResponseSchema,
  supportAttachmentParamsSchema,
  supportAttachmentSchema,
  supportTicketDetailSchema,
  supportTicketListResponseSchema,
  supportTicketParamsSchema,
  supportTicketViewQuerySchema,
  supportUnreadResponseSchema,
  updateSupportTicketRequestSchema,
} from "@veolms/contracts";
import type { FastifyRequest } from "fastify";

import { errorResponse } from "../../lib/errors.ts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import { createPermissionPreHandlers } from "../authorization/index.ts";
import { createSupportController } from "./support.controller.ts";
import { createSupportService } from "./support.service.ts";

function perUser(max: number, timeWindow: string) {
  return {
    max,
    timeWindow,
    hook: "preHandler",
    keyGenerator: (request: FastifyRequest) =>
      request.user?.id ?? normalizeIP(request.ip),
  } as const;
}

const supportRoutes: RoutePlugin = async (app, options) => {
  await app.register(fastifyMultipart, {
    limits: { files: 1, fields: 4, fileSize: SUPPORT_ATTACHMENT_MAX_BYTES },
  });

  const { signedIn, requires } = createPermissionPreHandlers(options.database);
  const service = createSupportService({
    database: options.database,
    services: options.services,
  });
  const controller = createSupportController({ service });
  const tags = ["Support"];

  app.post(
    "/support/tickets",
    {
      config: { rateLimit: perUser(10, "1 hour") },
      // A list of its own: the rate limiter is added to the list it is given.
      preHandler: [...signedIn],
      schema: {
        operationId: "createSupportTicket",
        tags,
        summary: "Report a problem or send feedback",
        description:
          "Files are uploaded first with POST /support/attachments and sent here by id.",
        body: createSupportTicketRequestSchema,
        response: {
          201: jsonResponse(
            "The new report or feedback.",
            createSupportTicketResponseSchema,
          ),
          400: errorResponse("Invalid message or files"),
          401: errorResponse("Authentication required"),
          429: errorResponse("Too many messages"),
        },
      },
    },
    controller.createTicket,
  );

  app.get(
    "/support/tickets",
    {
      preHandler: signedIn,
      schema: {
        operationId: "listMySupportTickets",
        tags,
        summary: "The signed-in learner's reports and feedback",
        response: {
          200: jsonResponse(
            "Most recent activity first.",
            supportTicketListResponseSchema,
          ),
          401: errorResponse("Authentication required"),
        },
      },
    },
    controller.listMine,
  );

  app.get(
    "/support/unread",
    {
      preHandler: signedIn,
      schema: {
        operationId: "countUnreadSupportReplies",
        tags,
        summary:
          "How many of the learner's tickets have a reply they haven't read",
        response: {
          200: jsonResponse("Unread count.", supportUnreadResponseSchema),
          401: errorResponse("Authentication required"),
        },
      },
    },
    controller.unreadCount,
  );

  app.get(
    "/support/tickets/:ticketId",
    {
      preHandler: signedIn,
      schema: {
        operationId: "getSupportTicket",
        tags,
        summary: "One report or feedback with its conversation",
        description:
          "For its sender, or staff with support.read (who also see internal notes). Opening it marks it read.",
        params: supportTicketParamsSchema,
        querystring: supportTicketViewQuerySchema,
        response: {
          200: jsonResponse("The ticket.", supportTicketDetailSchema),
          401: errorResponse("Authentication required"),
          404: errorResponse("Not found"),
        },
      },
    },
    controller.getTicket,
  );

  app.post(
    "/support/tickets/:ticketId/messages",
    {
      config: { rateLimit: perUser(30, "10 minutes") },
      preHandler: [...signedIn],
      schema: {
        operationId: "postSupportMessage",
        tags,
        summary: "Reply in a report or feedback conversation",
        description:
          "The sender replies as the learner; staff with support.manage reply as the team, can leave an internal note and can change the status in the same step.",
        params: supportTicketParamsSchema,
        querystring: supportTicketViewQuerySchema,
        body: createSupportMessageRequestSchema,
        response: {
          201: jsonResponse(
            "The ticket, with the reply.",
            supportTicketDetailSchema,
          ),
          400: errorResponse("Invalid message or files"),
          401: errorResponse("Authentication required"),
          403: errorResponse("Not allowed"),
          404: errorResponse("Not found"),
          429: errorResponse("Too many messages"),
        },
      },
    },
    controller.postMessage,
  );

  app.patch(
    "/support/tickets/:ticketId",
    {
      preHandler: requires("support.manage"),
      schema: {
        operationId: "updateSupportTicket",
        tags,
        summary:
          "Change the status, assignee, priority or category of a report or feedback",
        description:
          "Each change is logged in the ticket's Activity. A new assignee other than the caller is notified by email and in the app.",
        params: supportTicketParamsSchema,
        body: updateSupportTicketRequestSchema,
        response: {
          200: jsonResponse("The ticket.", supportTicketDetailSchema),
          400: errorResponse("Status does not apply"),
          401: errorResponse("Authentication required"),
          403: errorResponse("Missing support.manage"),
          404: errorResponse("Not found"),
        },
      },
    },
    controller.updateTicket,
  );

  const noteResponses = {
    200: jsonResponse("The ticket.", supportTicketDetailSchema),
    401: errorResponse("Authentication required"),
    403: errorResponse("Not the note's author or an admin"),
    404: errorResponse("Not found"),
  };

  app.patch(
    "/support/tickets/:ticketId/notes/:messageId",
    {
      preHandler: requires("support.manage"),
      schema: {
        operationId: "editSupportNote",
        tags,
        summary: "Edit an internal note",
        description: "Its author or an admin only.",
        params: supportNoteParamsSchema,
        body: updateSupportNoteRequestSchema,
        response: noteResponses,
      },
    },
    controller.editNote,
  );

  app.put(
    "/support/tickets/:ticketId/notes/:messageId/pin",
    {
      preHandler: requires("support.manage"),
      schema: {
        operationId: "pinSupportNote",
        tags,
        summary: "Pin an internal note to the top of the Activity, or unpin it",
        params: supportNoteParamsSchema,
        body: pinSupportNoteRequestSchema,
        response: noteResponses,
      },
    },
    controller.pinNote,
  );

  app.delete(
    "/support/tickets/:ticketId/notes/:messageId",
    {
      preHandler: requires("support.manage"),
      schema: {
        operationId: "deleteSupportNote",
        tags,
        summary: "Delete an internal note",
        description:
          "Its author or an admin only. The note is kept for the record and no longer listed.",
        params: supportNoteParamsSchema,
        response: noteResponses,
      },
    },
    controller.deleteNote,
  );

  app.get(
    "/support/admin/team",
    {
      preHandler: requires("support.manage"),
      schema: {
        operationId: "listSupportTeam",
        tags,
        summary: "Who reports can be assigned to",
        description:
          "Everyone with support.manage, the caller first, with what is assigned to them and not done.",
        response: {
          200: jsonResponse("The team.", supportTeamResponseSchema),
          401: errorResponse("Authentication required"),
          403: errorResponse("Missing support.manage"),
        },
      },
    },
    controller.listTeam,
  );

  app.get(
    "/support/admin/tickets",
    {
      preHandler: requires("support.read"),
      schema: {
        operationId: "listSupportTicketsForStaff",
        tags,
        summary: "Everyone's reports or feedback, filtered",
        querystring: supportAdminListQuerySchema,
        response: {
          200: jsonResponse(
            "A page of tickets.",
            supportAdminListResponseSchema,
          ),
          400: errorResponse("Invalid filter or page"),
          401: errorResponse("Authentication required"),
          403: errorResponse("Missing support.read"),
        },
      },
    },
    controller.listForStaff,
  );

  app.get(
    "/support/admin/stats",
    {
      preHandler: requires("support.read"),
      schema: {
        operationId: "getSupportStats",
        tags,
        summary: "Counts by status, and the feedback summary",
        response: {
          200: jsonResponse("Counts.", supportAdminStatsResponseSchema),
          401: errorResponse("Authentication required"),
          403: errorResponse("Missing support.read"),
        },
      },
    },
    controller.statsForStaff,
  );

  app.post(
    "/support/attachments",
    {
      config: { rateLimit: perUser(30, "1 minute") },
      preHandler: [...signedIn],
      schema: {
        operationId: "uploadSupportAttachment",
        tags,
        summary: "Upload a file to send with a report, feedback or reply",
        consumes: ["multipart/form-data"],
        response: {
          201: jsonResponse("The stored file.", supportAttachmentSchema),
          400: errorResponse("File is required"),
          401: errorResponse("Authentication required"),
          413: errorResponse("File is too large"),
          415: errorResponse("File type not supported"),
          429: errorResponse("Too many files"),
        },
      },
    },
    controller.uploadAttachment,
  );

  app.get(
    "/support/attachments/:attachmentId",
    {
      preHandler: signedIn,
      schema: {
        operationId: "getSupportAttachment",
        tags,
        summary: "Open a file sent with a report, feedback or reply",
        params: supportAttachmentParamsSchema,
      },
    },
    controller.openAttachment,
  );
};

export default supportRoutes;
