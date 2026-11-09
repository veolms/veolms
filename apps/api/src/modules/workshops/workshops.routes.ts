import {
  cancelWorkshopRequestSchema,
  createWorkshopRequestSchema,
  heroVideoPlaybackSchema,
  setWorkshopRecordingRequestSchema,
  videoPlaybackTokenSchema,
  updateWorkshopRequestSchema,
  workshopAdminListQuerySchema,
  workshopAdminListResponseSchema,
  workshopAdminSchema,
  workshopDeletedResponseSchema,
  workshopIdParamsSchema,
  workshopPublishCheckSchema,
  workshopPublicListResponseSchema,
  workshopPublicSchema,
  workshopRegistrationResponseSchema,
  workshopSessionParamsSchema,
  workshopSlugParamsSchema,
  workshopUnregisterResponseSchema,
  workshopViewerSchema,
} from "@veolms/contracts";

import { errorResponse } from "../../lib/errors.ts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import {
  createAuthorizationService,
  createPermissionPreHandlers,
} from "../authorization/index.ts";
import { createMediaService } from "../media/media.service.ts";
import { createWorkshopsController } from "./workshops.controller.ts";
import { createWorkshopsService } from "./workshops.service.ts";

/**
 * Workshops: the admin side (/workshops/admin) and the learner side (list,
 * page, register, calendar, join).
 *
 * Scope "platform": an instructor's role is scoped to their courses, and
 * they may run workshops too, so the check is on the key alone.
 */
const workshopsRoutes: RoutePlugin = async (app, options) => {
  const { signedIn, requires } = createPermissionPreHandlers(options.database);
  const service = createWorkshopsService({
    database: options.database,
    mediaService: createMediaService({
      database: options.database,
      services: options.services,
    }),
    authorization: createAuthorizationService(options.database),
    paymentGateways: options.services.paymentGateways,
  });
  const controller = createWorkshopsController({ service });
  const tags = ["Workshops"];
  const reads = requires(["workshop.read", "workshop.manage"], "platform");
  const manages = requires("workshop.manage", "platform");
  const common = {
    401: errorResponse("Authentication required"),
    403: errorResponse("Missing workshop permission"),
  };

  app.get(
    "/workshops/admin",
    {
      preHandler: reads,
      schema: {
        operationId: "listWorkshopsAdmin",
        tags,
        summary: "Workshops by tab: upcoming, past, drafts, cancelled",
        querystring: workshopAdminListQuerySchema,
        response: {
          200: jsonResponse(
            "Upcoming soonest first; the others most recently changed first.",
            workshopAdminListResponseSchema,
          ),
          ...common,
        },
      },
    },
    controller.list,
  );

  app.post(
    "/workshops/admin",
    {
      preHandler: manages,
      schema: {
        operationId: "createWorkshop",
        tags,
        summary: "Create a workshop draft",
        body: createWorkshopRequestSchema,
        response: {
          201: jsonResponse("The new draft.", workshopAdminSchema),
          400: errorResponse("Invalid request"),
          ...common,
          404: errorResponse("Course not found"),
          409: errorResponse("Address already in use"),
        },
      },
    },
    controller.create,
  );

  app.get(
    "/workshops/admin/:workshopId",
    {
      preHandler: reads,
      schema: {
        operationId: "getWorkshopAdmin",
        tags,
        summary: "One workshop with its sessions and meeting links",
        params: workshopIdParamsSchema,
        response: {
          200: jsonResponse("The workshop.", workshopAdminSchema),
          ...common,
          404: errorResponse("Workshop not found"),
        },
      },
    },
    controller.getOne,
  );

  app.patch(
    "/workshops/admin/:workshopId",
    {
      preHandler: manages,
      schema: {
        operationId: "updateWorkshop",
        tags,
        summary: "Change a workshop; `sessions` replaces the whole set",
        params: workshopIdParamsSchema,
        body: updateWorkshopRequestSchema,
        response: {
          200: jsonResponse(
            "The workshop after the change.",
            workshopAdminSchema,
          ),
          400: errorResponse("Invalid request"),
          ...common,
          404: errorResponse("Workshop or course not found"),
          409: errorResponse("Address in use, or locked once published"),
        },
      },
    },
    controller.update,
  );

  app.get(
    "/workshops/admin/:workshopId/publish-check",
    {
      preHandler: reads,
      schema: {
        operationId: "checkWorkshopPublish",
        tags,
        summary: "What still stops this draft from being published",
        params: workshopIdParamsSchema,
        response: {
          200: jsonResponse(
            "Issues, field by field.",
            workshopPublishCheckSchema,
          ),
          ...common,
          404: errorResponse("Workshop not found"),
        },
      },
    },
    controller.publishCheck,
  );

  app.post(
    "/workshops/admin/:workshopId/publish",
    {
      preHandler: manages,
      schema: {
        operationId: "publishWorkshop",
        tags,
        summary: "Publish a draft to learners",
        params: workshopIdParamsSchema,
        response: {
          200: jsonResponse("The published workshop.", workshopAdminSchema),
          400: errorResponse("The draft is not ready (see publish-check)"),
          ...common,
          404: errorResponse("Workshop not found"),
          409: errorResponse("A cancelled workshop cannot be published"),
        },
      },
    },
    controller.publish,
  );

  app.post(
    "/workshops/admin/:workshopId/unpublish",
    {
      preHandler: manages,
      schema: {
        operationId: "unpublishWorkshop",
        tags,
        summary: "Hide a published workshop again; registrations are kept",
        params: workshopIdParamsSchema,
        response: {
          200: jsonResponse(
            "The workshop, a draft again.",
            workshopAdminSchema,
          ),
          ...common,
          404: errorResponse("Workshop not found"),
        },
      },
    },
    controller.unpublish,
  );

  app.post(
    "/workshops/admin/:workshopId/cancel",
    {
      preHandler: manages,
      schema: {
        operationId: "cancelWorkshop",
        tags,
        summary: "Cancel a workshop with a reason for its registrants",
        params: workshopIdParamsSchema,
        body: cancelWorkshopRequestSchema,
        response: {
          200: jsonResponse("The cancelled workshop.", workshopAdminSchema),
          400: errorResponse("Invalid request"),
          ...common,
          404: errorResponse("Workshop not found"),
        },
      },
    },
    controller.cancel,
  );

  app.delete(
    "/workshops/admin/:workshopId",
    {
      preHandler: manages,
      schema: {
        operationId: "deleteWorkshop",
        tags,
        summary: "Delete a draft or cancelled workshop",
        params: workshopIdParamsSchema,
        response: {
          200: jsonResponse("Deleted.", workshopDeletedResponseSchema),
          ...common,
          404: errorResponse("Workshop not found"),
          409: errorResponse(
            "Published workshops must be unpublished or cancelled first",
          ),
        },
      },
    },
    controller.remove,
  );

  app.put(
    "/workshops/admin/:workshopId/sessions/:sessionId/recording",
    {
      preHandler: manages,
      schema: {
        operationId: "setWorkshopSessionRecording",
        tags,
        summary:
          "Attach an uploaded or imported video as the session's recording (null removes it); registrants are told once it is ready",
        params: workshopSessionParamsSchema,
        body: setWorkshopRecordingRequestSchema,
        response: {
          200: jsonResponse(
            "The workshop after the change.",
            workshopAdminSchema,
          ),
          400: errorResponse("Not a video, or its processing failed"),
          ...common,
          404: errorResponse("Workshop or session not found"),
        },
      },
    },
    controller.setRecording,
  );

  // --- Learners ---

  app.get(
    "/workshops",
    {
      schema: {
        operationId: "listWorkshops",
        tags,
        summary: "Published workshops: upcoming (soonest first) and past",
        response: {
          200: jsonResponse(
            "Upcoming and past.",
            workshopPublicListResponseSchema,
          ),
        },
      },
    },
    controller.listPublic,
  );

  app.get(
    "/workshops/:slug",
    {
      schema: {
        operationId: "getWorkshop",
        tags,
        summary: "A published workshop as learners see it (no meeting links)",
        params: workshopSlugParamsSchema,
        response: {
          200: jsonResponse("The workshop.", workshopPublicSchema),
          404: errorResponse("Workshop not found"),
        },
      },
    },
    controller.getPublic,
  );

  app.get(
    "/workshops/:slug/me",
    {
      preHandler: signedIn,
      schema: {
        operationId: "getWorkshopViewer",
        tags,
        summary:
          "Whether the signed-in learner is registered, and may register",
        params: workshopSlugParamsSchema,
        response: {
          200: jsonResponse("The viewer's standing.", workshopViewerSchema),
          401: errorResponse("Authentication required"),
          404: errorResponse("Workshop not found"),
        },
      },
    },
    controller.viewer,
  );

  app.post(
    "/workshops/:workshopId/register",
    {
      preHandler: signedIn,
      schema: {
        operationId: "registerForWorkshop",
        tags,
        summary: "Register for a free workshop",
        params: workshopIdParamsSchema,
        response: {
          201: jsonResponse("Registered.", workshopRegistrationResponseSchema),
          401: errorResponse("Authentication required"),
          403: errorResponse("Only the linked course's learners may register"),
          404: errorResponse("Workshop not found"),
          409: errorResponse(
            "Full, ended, cancelled, or paid (not yet available)",
          ),
        },
      },
    },
    controller.register,
  );

  app.delete(
    "/workshops/:workshopId/register",
    {
      preHandler: signedIn,
      schema: {
        operationId: "unregisterFromWorkshop",
        tags,
        summary: "Cancel the signed-in learner's registration",
        params: workshopIdParamsSchema,
        response: {
          200: jsonResponse(
            "No longer registered.",
            workshopUnregisterResponseSchema,
          ),
          401: errorResponse("Authentication required"),
          404: errorResponse("Workshop not found"),
        },
      },
    },
    controller.unregister,
  );

  app.get(
    "/workshops/:workshopId/calendar.ics",
    {
      preHandler: signedIn,
      schema: {
        operationId: "downloadWorkshopCalendar",
        tags,
        summary:
          "The workshop's sessions as a calendar file (registrants only)",
        params: workshopIdParamsSchema,
        response: {
          401: errorResponse("Authentication required"),
          403: errorResponse("Not registered"),
          404: errorResponse("Workshop not found"),
        },
      },
    },
    controller.calendar,
  );

  app.get(
    "/workshops/:workshopId/sessions/:sessionId/join",
    {
      preHandler: signedIn,
      schema: {
        operationId: "joinWorkshopSession",
        tags,
        summary:
          "Send a registrant to the session's meeting link (from 15 minutes before the start until it ends) and note the attendance",
        params: workshopSessionParamsSchema,
        response: {
          401: errorResponse("Authentication required"),
          403: errorResponse("Not registered"),
          404: errorResponse("Workshop or session not found"),
          409: errorResponse("Not open yet, ended, or no meeting link set"),
        },
      },
    },
    controller.join,
  );

  app.get(
    "/workshops/:workshopId/sessions/:sessionId/recording/playback",
    {
      preHandler: signedIn,
      schema: {
        operationId: "getWorkshopRecordingPlayback",
        tags,
        summary:
          "Play a session's recording (registrants, the linked course's learners and staff)",
        params: workshopSessionParamsSchema,
        response: {
          200: jsonResponse("The recording's stream.", heroVideoPlaybackSchema),
          401: errorResponse("Authentication required"),
          403: errorResponse("Not registered"),
          404: errorResponse("No recording"),
          409: errorResponse("The recording is still being processed"),
          503: errorResponse("CDN delivery is not configured"),
        },
      },
    },
    controller.recordingPlayback,
  );

  app.get(
    "/workshops/:workshopId/sessions/:sessionId/recording/playback-token",
    {
      preHandler: signedIn,
      schema: {
        operationId: "getWorkshopRecordingPlaybackToken",
        tags,
        summary: "A fresh segment token for the recording's stream",
        params: workshopSessionParamsSchema,
        response: {
          200: jsonResponse("The token.", videoPlaybackTokenSchema),
          401: errorResponse("Authentication required"),
          403: errorResponse("Not registered"),
          404: errorResponse("No recording"),
          409: errorResponse("Not ready, or no token needed"),
        },
      },
    },
    controller.recordingPlaybackToken,
  );
};

export default workshopsRoutes;
