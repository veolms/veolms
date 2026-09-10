import {
  authConfigResponseSchema,
  authMessageResponseSchema,
  currentUserResponseSchema,
  loginRequestSchema,
  loginResponseSchema,
  profileUpdateRequestSchema,
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
  const { middleware } = context;

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
          "Inspects and returns the active authenticated user profile details, including whether the current session has completed MFA. This endpoint does not require MFA step-up so the client can choose verify vs enroll.",
        response: {
          200: jsonResponse(
            "User context, when a session is present.",
            currentUserResponseSchema,
          ),
        },
      },
      preHandler: [middleware.authenticate],
    },
    controller.me,
  );

  app.patch(
    "/auth/me",
    {
      schema: {
        operationId: "updateCurrentUserProfile",
        tags: ["Auth"],
        summary: "Update current user profile",
        description:
          "Updates editable public profile fields for the authenticated account.",
        body: profileUpdateRequestSchema,
        response: {
          200: jsonResponse("User profile updated.", userProfileResponseSchema),
          400: errorResponse("Invalid profile or username already taken."),
          404: errorResponse("User account was not found."),
        },
      },
      preHandler: [middleware.authenticate, middleware.requireAuthenticated],
    },
    controller.updateProfile,
  );

  app.delete(
    "/auth/me",
    {
      schema: {
        operationId: "deactivateCurrentUserAccount",
        tags: ["Auth"],
        summary: "Deactivate the current user account",
        description:
          "Deactivates the authenticated account, invalidates every active session, and queues a confirmation email.",
        response: {
          200: jsonResponse("Account deactivated.", authMessageResponseSchema),
          401: errorResponse("Authentication required."),
          403: errorResponse("MFA step-up required."),
          404: errorResponse("User account was not found."),
        },
      },
      preHandler: context.mfaVerified,
    },
    controller.deactivateAccount,
  );
};

export default authenticationRoutes;
