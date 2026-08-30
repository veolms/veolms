import {
  authConfigResponseSchema,
  authMessageResponseSchema,
  loginRequestSchema,
  loginResponseSchema,
  registerRequestSchema,
  userProfileResponseSchema,
} from "@veolms/contracts";

import { errorResponse } from "../../../lib/errors.ts";
import { jsonResponse } from "../../../lib/responses.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { createAuthContext } from "../shared/auth.context.ts";
import { createAuthController } from "./authentication.controller.ts";

const authenticationRoutes: RoutePlugin = async (app, options) => {
  const context = createAuthContext(options);
  const controller = createAuthController(context);
  const { middleware, mfaVerified } = context;

  app.post(
    "/auth/login",
    {
      schema: {
        operationId: "loginUser",
        tags: ["Auth"],
        summary: "Log in with OTP",
        description: "Checks 6-digit OTP and logs in if user exists.",
        body: loginRequestSchema,
        response: {
          200: jsonResponse("Login successful.", loginResponseSchema),
          400: errorResponse("No user exists or code invalid."),
          401: errorResponse("Verification failed."),
        },
      },
    },
    controller.login,
  );

  app.post(
    "/auth/register",
    {
      schema: {
        operationId: "registerUser",
        tags: ["Auth"],
        summary: "Register a new user",
        description:
          "Registers a user and assigns the administrator role (if first user) or student role.",
        body: registerRequestSchema,
        response: {
          201: jsonResponse("Registration successful.", loginResponseSchema),
          400: errorResponse(
            "Invalid code, username taken, or user already exists.",
          ),
        },
      },
    },
    controller.register,
  );

  app.get(
    "/auth/config",
    {
      schema: {
        operationId: "getAuthConfig",
        tags: ["Auth"],
        summary: "Get public auth configs",
        description: "Returns public OAuth Client IDs.",
        response: {
          200: jsonResponse(
            "OAuth Client IDs context.",
            authConfigResponseSchema,
          ),
        },
      },
    },
    controller.getConfig,
  );

  app.post(
    "/auth/logout",
    {
      schema: {
        operationId: "logout",
        tags: ["Auth"],
        summary: "Log out of session",
        description: "Invalidates the active session and clears cookies.",
        response: {
          200: jsonResponse("Logged out.", authMessageResponseSchema),
        },
      },
      preHandler: [middleware.authenticate],
    },
    controller.logout,
  );

  app.get(
    "/auth/me",
    {
      schema: {
        operationId: "getCurrentUserProfile",
        tags: ["Auth"],
        summary: "Get current user profile",
        description:
          "Inspects and returns the active authenticated user profile details.",
        response: {
          200: jsonResponse("User context.", userProfileResponseSchema),
          401: errorResponse("Session missing or invalid."),
          403: errorResponse("MFA step-up required."),
        },
      },
      preHandler: mfaVerified,
    },
    controller.me,
  );
};

export default authenticationRoutes;
