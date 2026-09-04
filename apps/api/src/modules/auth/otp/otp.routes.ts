import {
  authMessageResponseSchema,
  emailVerificationSendRequestSchema,
  emailVerificationVerifyRequestSchema,
  phoneVerificationSendRequestSchema,
  phoneVerificationVerifyRequestSchema,
  otpSendRequestSchema,
} from "@veolms/contracts";

import { errorResponse } from "../../../lib/errors.ts";
import { jsonResponse } from "../../../lib/responses.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { createAuthContext } from "../shared/auth.context.ts";
import { createOtpController } from "./otp.controller.ts";

const otpRoutes: RoutePlugin = async (app, options) => {
  const context = createAuthContext(options);
  const controller = createOtpController(context);

  app.post(
    "/auth/otp/send",
    {
      schema: {
        operationId: "sendOtp",
        tags: ["Auth"],
        summary: "Send login/register OTP",
        description:
          "Dispatches a secure 6-digit verification code via email or SMS.",
        body: otpSendRequestSchema,
        response: {
          200: jsonResponse(
            "OTP dispatched successfully.",
            authMessageResponseSchema,
          ),
          400: errorResponse("Validation error or missing parameters."),
          429: errorResponse("Rate limit exceeded."),
        },
      },
    },
    controller.send,
  );

  app.post(
    "/auth/me/phone/otp/send",
    {
      schema: {
        operationId: "sendPhoneVerificationOtp",
        tags: ["Auth"],
        summary: "Send mobile verification OTP",
        description:
          "Sends a verification code to a mobile number for the authenticated account.",
        body: phoneVerificationSendRequestSchema,
        response: {
          200: jsonResponse(
            "Mobile verification OTP dispatched successfully.",
            authMessageResponseSchema,
          ),
          400: errorResponse("Validation error or missing parameters."),
          404: errorResponse("User account was not found."),
          409: errorResponse("Phone number is already in use."),
          429: errorResponse("Rate limit exceeded."),
        },
      },
      preHandler: context.authenticated,
    },
    controller.sendPhoneVerification,
  );

  app.post(
    "/auth/me/phone/otp/verify",
    {
      schema: {
        operationId: "verifyPhoneNumber",
        tags: ["Auth"],
        summary: "Verify mobile number",
        description:
          "Verifies the mobile OTP and attaches the confirmed number to the authenticated account.",
        body: phoneVerificationVerifyRequestSchema,
        response: {
          200: jsonResponse(
            "Mobile number verified successfully.",
            authMessageResponseSchema,
          ),
          400: errorResponse("Validation error or missing parameters."),
          401: errorResponse("Verification code is invalid or expired."),
          404: errorResponse("User account was not found."),
          409: errorResponse("Phone number is already in use."),
        },
      },
      preHandler: context.authenticated,
    },
    controller.verifyPhoneNumber,
  );

  app.post(
    "/auth/me/email/otp/send",
    {
      schema: {
        operationId: "sendEmailVerificationOtp",
        tags: ["Auth"],
        summary: "Send email verification OTP",
        description:
          "Sends a verification code to the authenticated account's email address.",
        body: emailVerificationSendRequestSchema,
        response: {
          200: jsonResponse(
            "Email verification OTP dispatched successfully.",
            authMessageResponseSchema,
          ),
          400: errorResponse("No email address is available to verify."),
          404: errorResponse("User account was not found."),
          429: errorResponse("Rate limit exceeded."),
        },
      },
      preHandler: context.authenticated,
    },
    controller.sendEmailVerification,
  );

  app.post(
    "/auth/me/email/otp/verify",
    {
      schema: {
        operationId: "verifyEmailAddress",
        tags: ["Auth"],
        summary: "Verify email address",
        description: "Verifies the email OTP for the authenticated account.",
        body: emailVerificationVerifyRequestSchema,
        response: {
          200: jsonResponse(
            "Email address verified successfully.",
            authMessageResponseSchema,
          ),
          400: errorResponse("No email address is available to verify."),
          401: errorResponse("Verification code is invalid or expired."),
          404: errorResponse("User account was not found."),
        },
      },
      preHandler: context.authenticated,
    },
    controller.verifyEmail,
  );
};

export default otpRoutes;
