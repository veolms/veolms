import { z } from "zod";
import {
  accessGrantSchema,
  courseAccessChangeResponseSchema,
  courseAccessParamsSchema,
  createManualAccessGrantRequestSchema,
} from "@veolms/contracts";
import { jsonResponse } from "../../lib/responses.ts";
import { errorResponse } from "../../lib/errors.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import { createCommerceContext } from "../commerce/shared/commerce.context.ts";
import { createAccessService } from "./access.service.ts";
import { createAccessController } from "./access.controller.ts";

const accessRoutes: RoutePlugin = async (app, options) => {
  const ctx = createCommerceContext(options);
  const service = createAccessService();
  const controller = createAccessController({
    database: options.database,
    service,
  });

  // 1. POST /access/grants - Create manual access grant (Admin)
  app.post(
    "/access/grants",
    {
      preHandler: ctx.requires("student.access.manage"),
      schema: {
        operationId: "grantManualAccess",
        tags: ["Access Grants"],
        summary: "Grant manual course access to a user",
        description:
          "Creates an audited manual access grant and active enrollment without a gateway transaction.",
        body: createManualAccessGrantRequestSchema,
        response: {
          201: jsonResponse("Access grant created", accessGrantSchema),
          400: errorResponse(
            "Invalid request body, a past end date, or a course that is not published",
          ),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden - Admin required"),
          404: errorResponse("Learner or course not found"),
        },
      },
    },
    controller.grantManualAccess,
  );

  // 2. DELETE /access/grants/:grantId - Revoke access grant (Admin)
  app.delete(
    "/access/grants/:grantId",
    {
      preHandler: ctx.requires("student.access.manage"),
      schema: {
        operationId: "revokeAccessGrant",
        tags: ["Access Grants"],
        summary: "Revoke an access grant",
        description:
          "Revokes an active access grant and flips corresponding enrollment status to revoked.",
        params: z.object({ grantId: z.uuid() }),
        response: {
          200: jsonResponse(
            "Access grant revoked",
            z.object({ message: z.string() }),
          ),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden - Admin required"),
          404: errorResponse("Access grant not found"),
        },
      },
    },
    controller.revokeAccessGrant,
  );

  // 3. GET /access/users/:userId/grants - List access grants for a user (Admin)
  app.get(
    "/access/users/:userId/grants",
    {
      preHandler: ctx.requires("student.access.manage"),
      schema: {
        operationId: "listUserAccessGrants",
        tags: ["Access Grants"],
        summary: "List access grants for a user",
        params: z.object({ userId: z.uuid() }),
        response: {
          200: jsonResponse(
            "List of access grants",
            z.array(accessGrantSchema),
          ),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden - Admin required"),
        },
      },
    },
    controller.listUserGrants,
  );

  // 4. DELETE /access/users/:userId/courses/:courseId - Revoke a learner's access to a course (Admin)
  app.delete(
    "/access/users/:userId/courses/:courseId",
    {
      preHandler: ctx.requires("student.access.manage"),
      schema: {
        operationId: "revokeCourseAccess",
        tags: ["Access Grants"],
        summary: "Revoke a learner's access to a course",
        description:
          "Revokes the learner's access grant and enrollment for the course, however the access was obtained. The order that paid for it is not changed and no money is returned; progress is kept.",
        params: courseAccessParamsSchema,
        response: {
          200: jsonResponse("Access revoked", courseAccessChangeResponseSchema),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden - Admin required"),
          404: errorResponse("No active access to this course"),
        },
      },
    },
    controller.revokeCourseAccess,
  );

  // 5. POST /access/users/:userId/courses/:courseId/restore - Give revoked access back (Admin)
  app.post(
    "/access/users/:userId/courses/:courseId/restore",
    {
      preHandler: ctx.requires("student.access.manage"),
      schema: {
        operationId: "restoreCourseAccess",
        tags: ["Access Grants"],
        summary: "Restore a learner's revoked access to a course",
        description:
          "Makes a revoked access grant and enrollment active again with the order, source and access period they had before.",
        params: courseAccessParamsSchema,
        response: {
          200: jsonResponse(
            "Access restored",
            courseAccessChangeResponseSchema,
          ),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden - Admin required"),
          404: errorResponse("Learner was never enrolled in this course"),
          409: errorResponse("Access is not revoked"),
        },
      },
    },
    controller.restoreCourseAccess,
  );
};

export default accessRoutes;
