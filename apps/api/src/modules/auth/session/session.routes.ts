import {
  authMessageResponseSchema,
  sessionParamsSchema,
  sessionResponseSchema,
} from "@veolms/contracts";

import { errorResponse } from "../../../lib/errors.ts";
import { jsonResponse } from "../../../lib/responses.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { createAuthContext } from "../shared/auth.context.ts";
import { createSessionController } from "./session.controller.ts";

const sessionRoutes: RoutePlugin = async (app, options) => {
  const context = createAuthContext(options);
  const { mfaVerified } = context;
  const controller = createSessionController(context);

  app.get(
    "/auth/sessions",
    {
      schema: {
        operationId: "getActiveSessions",
        tags: ["Auth"],
        summary: "List active sessions",
        description: "Returns metadata for all active user sessions.",
        response: {
          200: jsonResponse(
            "List of active sessions.",
            sessionResponseSchema.array(),
          ),
          401: errorResponse("Unauthorized."),
          403: errorResponse("MFA step-up required."),
        },
      },
      preHandler: mfaVerified,
    },
    controller.list,
  );

  app.delete(
    "/auth/sessions/:id",
    {
      schema: {
        operationId: "revokeSession",
        tags: ["Auth"],
        summary: "Revoke active session",
        description: "Invalidates a specific user session from the database.",
        params: sessionParamsSchema,
        response: {
          200: jsonResponse("Session revoked.", authMessageResponseSchema),
          401: errorResponse("Unauthorized."),
          403: errorResponse("MFA step-up required."),
        },
      },
      preHandler: mfaVerified,
    },
    controller.revoke,
  );

  app.post(
    "/auth/sessions/revoke-all",
    {
      schema: {
        operationId: "revokeAllOtherSessions",
        tags: ["Auth"],
        summary: "Revoke other active sessions",
        description:
          "Terminates all user sessions except the current active one.",
        response: {
          200: jsonResponse(
            "Other sessions successfully revoked.",
            authMessageResponseSchema,
          ),
          401: errorResponse("Unauthorized."),
          403: errorResponse("MFA step-up required."),
        },
      },
      preHandler: mfaVerified,
    },
    controller.revokeAll,
  );
};

export default sessionRoutes;
