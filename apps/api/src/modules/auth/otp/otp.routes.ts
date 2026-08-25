import {
  authMessageResponseSchema,
  otpSendRequestSchema,
} from "@veolms/contracts";

import { errorResponse } from "../../../lib/errors.ts";
import { jsonResponse } from "../../../lib/responses.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { createAuthContext } from "../shared/auth.context.ts";
import { createOtpController } from "./otp.controller.ts";

const otpRoutes: RoutePlugin = async (app, options) => {
  const controller = createOtpController(createAuthContext(options));

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
};

export default otpRoutes;
