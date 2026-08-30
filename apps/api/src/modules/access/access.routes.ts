import { z } from "zod";
import {
  accessGrantSchema,
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
      preHandler: ctx.requireAdmin,
      schema: {
        operationId: "grantManualAccess",
        tags: ["Access Grants"],
        summary: "Grant manual course access to a user",
        description: "Creates an audited manual access grant and active enrollment without a gateway transaction.",
        body: createManualAccessGrantRequestSchema,
        response: {
          201: jsonResponse("Access grant created", accessGrantSchema),
          400: errorResponse("Invalid request body"),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden - Admin required"),
        },
      },
    },
    controller.grantManualAccess,
  );

  // 2. DELETE /access/grants/:grantId - Revoke access grant (Admin)
  app.delete(
    "/access/grants/:grantId",
    {
      preHandler: ctx.requireAdmin,
      schema: {
        operationId: "revokeAccessGrant",
        tags: ["Access Grants"],
        summary: "Revoke an access grant",
        description: "Revokes an active access grant and flips corresponding enrollment status to revoked.",
        params: z.object({ grantId: z.uuid() }),
        response: {
          200: jsonResponse(
            "Access grant revoked",
            z.object({ message: z.string() }),
          ),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden - Admin required"),
        },
      },
    },
    controller.revokeAccessGrant,
  );

  // 3. GET /access/users/:userId/grants - List access grants for a user (Admin)
  app.get(
    "/access/users/:userId/grants",
    {
      preHandler: ctx.requireAdmin,
      schema: {
        operationId: "listUserAccessGrants",
        tags: ["Access Grants"],
        summary: "List access grants for a user",
        params: z.object({ userId: z.uuid() }),
        response: {
          200: jsonResponse("List of access grants", z.array(accessGrantSchema)),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden - Admin required"),
        },
      },
    },
    controller.listUserGrants,
  );
};

export default accessRoutes;
