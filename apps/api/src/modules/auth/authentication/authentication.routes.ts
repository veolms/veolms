import {
  authConfigResponseSchema,
  authMessageResponseSchema,
  avatarUploadCompleteRequestSchema,
  avatarUploadPresignRequestSchema,
  avatarUploadPresignResponseSchema,
  currentUserResponseSchema,
  loginRequestSchema,
  loginResponseSchema,
  profileUpdateRequestSchema,
  registerRequestSchema,
  selectAvatarRequestSchema,
  userAvatarListResponseSchema,
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

  app.post(
    "/auth/me/avatar/presign",
    {
      schema: {
        operationId: "presignCurrentUserAvatarUpload",
        tags: ["Auth"],
        summary: "Obtain a pre-signed profile photo upload URL",
        description:
          "Returns a direct-to-storage upload URL for the authenticated user's avatar original.",
        body: avatarUploadPresignRequestSchema,
        response: {
          200: jsonResponse(
            "Pre-signed avatar upload response.",
            avatarUploadPresignResponseSchema,
          ),
          400: errorResponse("A supported image file is required."),
          401: errorResponse("Authentication required."),
          413: errorResponse("The file is too large."),
          503: errorResponse("Avatar storage is not configured."),
        },
      },
      preHandler: [middleware.authenticate, middleware.requireAuthenticated],
    },
    controller.presignAvatarUpload,
  );

  app.post(
    "/auth/me/avatar/complete",
    {
      schema: {
        operationId: "completeCurrentUserAvatarUpload",
        tags: ["Auth"],
        summary: "Complete a profile photo upload",
        description:
          "Verifies the direct upload and persists the canonical 160px CDN avatar URL.",
        body: avatarUploadCompleteRequestSchema,
        response: {
          200: jsonResponse("Avatar updated.", userProfileResponseSchema),
          400: errorResponse("File not found, mismatched, or invalid."),
          401: errorResponse("Authentication required."),
          404: errorResponse("User account was not found."),
          413: errorResponse("The file is too large."),
          503: errorResponse("Avatar CDN delivery is not configured."),
        },
      },
      preHandler: [middleware.authenticate, middleware.requireAuthenticated],
    },
    controller.completeAvatarUpload,
  );

  app.get(
    "/auth/me/avatars",
    {
      schema: {
        operationId: "listCurrentUserAvatars",
        tags: ["Auth"],
        summary: "List the current user's stored avatars",
        description:
          "Returns up to five uploaded avatars and protected provider avatars.",
        response: {
          200: jsonResponse("Stored avatars.", userAvatarListResponseSchema),
          401: errorResponse("Authentication required."),
          404: errorResponse("User account was not found."),
        },
      },
      preHandler: [middleware.authenticate, middleware.requireAuthenticated],
    },
    controller.listAvatars,
  );

  app.post(
    "/auth/me/avatar/select",
    {
      schema: {
        operationId: "selectCurrentUserAvatar",
        tags: ["Auth"],
        summary: "Select a stored avatar",
        description:
          "Makes one of the current user's uploaded or provider avatars active.",
        body: selectAvatarRequestSchema,
        response: {
          200: jsonResponse("Avatar selected.", userProfileResponseSchema),
          401: errorResponse("Authentication required."),
          404: errorResponse("Avatar or user account was not found."),
        },
      },
      preHandler: [middleware.authenticate, middleware.requireAuthenticated],
    },
    controller.selectAvatar,
  );

  app.delete(
    "/auth/me/avatars",
    {
      schema: {
        operationId: "deleteCurrentUserUploadedAvatars",
        tags: ["Auth"],
        summary: "Delete all uploaded avatars",
        description:
          "Deletes the user's uploaded avatar history while preserving provider avatars.",
        response: {
          200: jsonResponse(
            "Uploaded avatars deleted.",
            userProfileResponseSchema,
          ),
          401: errorResponse("Authentication required."),
          404: errorResponse("User account was not found."),
        },
      },
      preHandler: [middleware.authenticate, middleware.requireAuthenticated],
    },
    controller.deleteUploadedAvatars,
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
