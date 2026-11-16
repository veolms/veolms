import {
  addWorkshopRegistrantRequestSchema,
  workshopCourseSectionsResponseSchema,
  importWorkshopRegistrantsRequestSchema,
  importWorkshopRegistrantsResponseSchema,
  publishWorkshopRequestSchema,
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
  workshopHomeCardSchema,
  workshopStandingsResponseSchema,
  workshopRegistrantParamsSchema,
  workshopRegistrantsResponseSchema,
  workshopRegistrantsQuerySchema,
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
import { createAuthContext } from "../auth/shared/auth.context.ts";
import { createStudentCreationService } from "../students/student-creation.service.ts";
import { createWorkshopsController } from "./workshops.controller.ts";
import { createWorkshopsService } from "./workshops.service.ts";
import { createWorkshopCourseLessons } from "./workshop-course-lessons.ts";

/**
 * Workshops: the admin side (/workshops/admin) and the learner side (list,
 * page, register, calendar, join).
 *
 * Scope "platform": an instructor's role is scoped to their courses, and
 * they may run workshops too, so the check is on the key alone.
 */
const workshopsRoutes: RoutePlugin = async (app, options) => {
  const { signedIn, requires } = createPermissionPreHandlers(options.database);
  // The Students module's own account creation, with its welcome email
  // left out: the workshop's confirmation already tells them where to go.
  const auth = createAuthContext(options);
  const studentCreation = createStudentCreationService({
    auth: auth.authService,
    grantCourse: async () => undefined,
    listGrantableCourses: async () => [],
    canGrantCourses: async () => false,
    sendWelcome: async () => true,
  });
  const service = createWorkshopsService({
    database: options.database,
    mediaService: createMediaService({
      database: options.database,
      services: options.services,
    }),
    authorization: createAuthorizationService(options.database),
    paymentGateways: options.services.paymentGateways,
    courseLessons: createWorkshopCourseLessons({
      database: options.database,
      services: options.services,
      logger: app.log,
    }),
    createStudentAccount: async (input, actorUserId) => {
      try {
        const created = await studentCreation.createStudent(
          { email: input.email, displayName: input.displayName },
          { id: actorUserId },
        );
        return created.id;
      } catch (error) {
        if ((error as { code?: string }).code === "EMAIL_TAKEN") return null;
        throw error;
      }
    },
  });
  const controller = createWorkshopsController({
    service,
    database: options.database,
  });
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
        body: publishWorkshopRequestSchema.optional(),
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

  app.get(
    "/workshops/admin/:workshopId/course-sections",
    {
      preHandler: reads,
      schema: {
        operationId: "listWorkshopCourseSections",
        tags,
        summary:
          "The linked course's sections, where a recording lesson may go (empty for an open workshop)",
        params: workshopIdParamsSchema,
        response: {
          200: jsonResponse(
            "Sections in course order.",
            workshopCourseSectionsResponseSchema,
          ),
          ...common,
          404: errorResponse("Workshop not found"),
        },
      },
    },
    controller.listCourseSections,
  );

  app.get(
    "/workshops/admin/:workshopId/registrants",
    {
      preHandler: reads,
      schema: {
        operationId: "listWorkshopRegistrants",
        tags,
        summary: "Who is registered: name, email, when, how, sessions joined",
        params: workshopIdParamsSchema,
        querystring: workshopRegistrantsQuerySchema,
        response: {
          200: jsonResponse("Newest first.", workshopRegistrantsResponseSchema),
          ...common,
          404: errorResponse("Workshop not found"),
        },
      },
    },
    controller.listRegistrants,
  );

  app.get(
    "/workshops/admin/:workshopId/registrants.csv",
    {
      preHandler: reads,
      schema: {
        operationId: "downloadWorkshopRegistrants",
        tags,
        summary: "The registrants as a CSV file",
        params: workshopIdParamsSchema,
        response: {
          ...common,
          404: errorResponse("Workshop not found"),
        },
      },
    },
    controller.registrantsCsv,
  );

  app.post(
    "/workshops/admin/:workshopId/registrants",
    {
      preHandler: manages,
      schema: {
        operationId: "addWorkshopRegistrant",
        tags,
        summary: "Register the account with this email (seats are not counted)",
        params: workshopIdParamsSchema,
        body: addWorkshopRegistrantRequestSchema,
        response: {
          201: jsonResponse(
            "The registrants after the change.",
            workshopRegistrantsResponseSchema,
          ),
          400: errorResponse("Invalid request"),
          ...common,
          404: errorResponse(
            "Workshop not found, or no account has that email",
          ),
          409: errorResponse("The workshop was cancelled"),
        },
      },
    },
    controller.addRegistrant,
  );

  app.post(
    "/workshops/admin/:workshopId/registrants/import",
    {
      preHandler: manages,
      schema: {
        operationId: "importWorkshopRegistrants",
        tags,
        summary:
          "Register many people from a spreadsheet; emails with no account get a student account",
        params: workshopIdParamsSchema,
        body: importWorkshopRegistrantsRequestSchema,
        response: {
          200: jsonResponse(
            "What was added and what was skipped.",
            importWorkshopRegistrantsResponseSchema,
          ),
          400: errorResponse("Invalid request"),
          ...common,
          404: errorResponse("Workshop not found"),
          409: errorResponse("The workshop was cancelled"),
        },
      },
    },
    controller.importRegistrants,
  );

  app.delete(
    "/workshops/admin/:workshopId/registrants/:userId",
    {
      preHandler: manages,
      schema: {
        operationId: "removeWorkshopRegistrant",
        tags,
        summary: "Take a seat back (a paid seat is refunded from its order)",
        params: workshopRegistrantParamsSchema,
        response: {
          200: jsonResponse(
            "The registrants after the change.",
            workshopRegistrantsResponseSchema,
          ),
          ...common,
          404: errorResponse("Workshop not found"),
        },
      },
    },
    controller.removeRegistrant,
  );

  // --- Learners ---

  app.get(
    "/workshops/me/standings",
    {
      preHandler: signedIn,
      schema: {
        operationId: "getMyWorkshopStandings",
        tags,
        summary: "Whether the learner is in each listed workshop",
        response: {
          200: jsonResponse(
            "One entry per listed workshop.",
            workshopStandingsResponseSchema,
          ),
          401: errorResponse("Authentication required"),
        },
      },
    },
    controller.standings,
  );

  app.get(
    "/workshops/me/next",
    {
      preHandler: signedIn,
      schema: {
        operationId: "getMyNextWorkshop",
        tags,
        summary:
          "The next session the learner is registered for, else the soonest open workshop (null when none)",
        response: {
          200: jsonResponse(
            "The card the home shows, or null.",
            workshopHomeCardSchema.nullable(),
          ),
          401: errorResponse("Authentication required"),
        },
      },
    },
    controller.myNextWorkshop,
  );

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
