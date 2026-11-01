import {
  activeSessionsVerificationRequestSchema,
  activeSessionsVerificationResponseSchema,
  authMessageResponseSchema,
  deviceLimitResponseSchema,
  loginResponseSchema,
  otpSendResponseSchema,
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
  const { authenticated, mfaVerified } = context;
  const controller = createSessionController(context);

  app.post(
    "/auth/sessions/verification/send",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "1 minute",
        },
      },
      schema: {
        operationId: "sendActiveSessionsVerificationCode",
        tags: ["Auth"],
        summary: "Send active-sessions verification code",
        description:
          "Sends an email OTP to the authenticated user's verified email address.",
        response: {
          200: jsonResponse(
            "Active-sessions verification code sent.",
            otpSendResponseSchema,
          ),
          401: errorResponse("Unauthorized."),
          409: errorResponse("A verified email address is required."),
          429: errorResponse("Rate limit exceeded."),
          503: errorResponse("Verification code could not be delivered."),
        },
      },
      preHandler: authenticated,
    },
    controller.sendActiveSessionsVerificationCode,
  );

  app.post(
    "/auth/sessions/verification/verify",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute",
        },
      },
      schema: {
        operationId: "verifyActiveSessionsCode",
        tags: ["Auth"],
        summary: "Verify identity for active sessions",
        description:
          "Consumes an email OTP valid for session management for up to 24 hours.",
        body: activeSessionsVerificationRequestSchema,
        response: {
          200: jsonResponse(
            "Identity verified for active sessions.",
            activeSessionsVerificationResponseSchema,
          ),
          400: errorResponse("Verification code is invalid or expired."),
          401: errorResponse("Unauthorized or authenticated session expired."),
          409: errorResponse("A verified email address is required."),
          429: errorResponse("Rate limit exceeded."),
        },
      },
      preHandler: authenticated,
    },
    controller.verifyActiveSessionsCode,
  );

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
          403: errorResponse(
            "Active-session email verification or sign-in MFA is required.",
          ),
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
          403: errorResponse(
            "Active-session email verification or sign-in MFA is required.",
          ),
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
          403: errorResponse(
            "Active-session email verification or sign-in MFA is required.",
          ),
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
