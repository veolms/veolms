import {
  authMessageResponseSchema,
  deviceLimitResponseSchema,
  loginResponseSchema,
  resolveDeviceLimitRequestSchema,
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

  // Signed out (the sign-in is waiting): the device-limit cookie, not a
  // session, says whose devices these are.
  app.get(
    "/auth/device-limit",
    {
      schema: {
        operationId: "getDeviceLimit",
        tags: ["Auth"],
        summary: "Devices to choose from at the device limit",
        description:
          "For a sign-in held back by the academy's device limit: the devices the student is signed in on.",
        response: {
          200: jsonResponse(
            "The devices and the limit.",
            deviceLimitResponseSchema,
          ),
          401: errorResponse("No sign-in is waiting, or it has expired."),
        },
      },
    },
    controller.deviceLimit,
  );

  app.post(
    "/auth/device-limit/resolve",
    {
      schema: {
        operationId: "resolveDeviceLimit",
        tags: ["Auth"],
        summary: "Sign a device out and sign in here",
        description:
          "Signs the chosen device out and completes the sign-in held back by the device limit.",
        body: resolveDeviceLimitRequestSchema,
        response: {
          200: jsonResponse("Signed in.", loginResponseSchema),
          401: errorResponse("No sign-in is waiting, or it has expired."),
          404: errorResponse("That device is no longer signed in."),
        },
      },
    },
    controller.resolveDeviceLimit,
  );
};

export default sessionRoutes;
