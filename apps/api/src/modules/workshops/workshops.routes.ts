import {
  cancelWorkshopRequestSchema,
  createWorkshopRequestSchema,
  updateWorkshopRequestSchema,
  workshopAdminListQuerySchema,
  workshopAdminListResponseSchema,
  workshopAdminSchema,
  workshopDeletedResponseSchema,
  workshopIdParamsSchema,
  workshopPublishCheckSchema,
} from "@veolms/contracts";

import { errorResponse } from "../../lib/errors.ts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import { createPermissionPreHandlers } from "../authorization/index.ts";
import { createWorkshopsController } from "./workshops.controller.ts";
import { createWorkshopsService } from "./workshops.service.ts";

/**
 * The admin side of workshops. Learner routes (list, page, register, join)
 * arrive in the next step and share this module.
 *
 * Scope "platform": an instructor's role is scoped to their courses, and
 * they may run workshops too, so the check is on the key alone.
 */
const workshopsRoutes: RoutePlugin = async (app, options) => {
  const { requires } = createPermissionPreHandlers(options.database);
  const service = createWorkshopsService({ database: options.database });
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
};

export default workshopsRoutes;
