import {
  authMessageResponseSchema,
  passkeyLoginVerifyRequestSchema,
  passkeyOptionsResponseSchema,
  passkeyRegisterVerifyRequestSchema,
  totpEnableRequestSchema,
  totpEnableResponseSchema,
  totpSetupResponseSchema,
  totpVerifyRequestSchema,
} from "@veolms/contracts";

import { errorResponse } from "../../../lib/errors.ts";
import { jsonResponse } from "../../../lib/responses.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { createAuthContext } from "../shared/auth.context.ts";
import { createMfaController } from "./mfa.controller.ts";

const mfaRoutes: RoutePlugin = async (app, options) => {
  const context = createAuthContext(options);
  const controller = createMfaController(context);

  app.post(
    "/auth/totp/setup",
    {
      schema: {
        operationId: "setupTotp",
        tags: ["Auth"],
        summary: "Generate TOTP Secret",
        description:
          "Generates a dynamic base32 MFA secret and provisioning URL challenge.",
        response: {
          200: jsonResponse("MFA secret metadata.", totpSetupResponseSchema),
          401: errorResponse("Unauthorized."),
        },
      },
      preHandler: context.authenticated,
    },
    controller.setupTotp,
  );

  app.post(
    "/auth/totp/enable",
    {
      schema: {
        operationId: "enableTotp",
        tags: ["Auth"],
        summary: "Activate TOTP Authenticator",
        description:
          "Validates verification code and registers authenticator. Outputs 10 backup recovery codes.",
        body: totpEnableRequestSchema,
        response: {
          200: jsonResponse(
            "TOTP enabled successfully. Recovery backup codes returned.",
            totpEnableResponseSchema,
          ),
          400: errorResponse("Verification failed."),
          401: errorResponse("Unauthorized."),
          403: errorResponse(
            "Step-up MFA required to replace existing factor.",
          ),
        },
      },
      preHandler: context.authenticated,
    },
    controller.enableTotp,
  );

  app.post(
    "/auth/totp/verify",
    {
      schema: {
        operationId: "verifyTotpCode",
        tags: ["Auth"],
        summary: "Verify TOTP Authenticator Code",
        description:
          "Validates a 6-digit TOTP code or 8-digit backup code to complete step-up MFA login.",
        body: totpVerifyRequestSchema,
        response: {
          200: jsonResponse("MFA verified.", authMessageResponseSchema),
          400: errorResponse("TOTP is not enabled."),
          401: errorResponse("Incorrect code or unauthorized."),
          429: errorResponse("Too many failed attempts."),
        },
      },
      preHandler: context.authenticated,
    },
    controller.verifyTotp,
  );

  app.post(
    "/auth/passkey/register/options",
    {
      schema: {
        operationId: "getPasskeyRegisterOptions",
        tags: ["Auth"],
        summary: "Generate Passkey Registration Options",
        description:
          "Creates options challenge payload to register a new WebAuthn credential.",
        response: {
          200: jsonResponse(
            "Passkey options challenge.",
            passkeyOptionsResponseSchema,
          ),
          401: errorResponse("Unauthorized."),
          403: errorResponse(
            "Step-up MFA required to replace existing factor.",
          ),
        },
      },
      preHandler: context.authenticated,
    },
    controller.registerOptions,
  );

  app.post(
    "/auth/passkey/register/verify",
    {
      schema: {
        operationId: "verifyPasskeyRegister",
        tags: ["Auth"],
        summary: "Verify Passkey Registration Response",
        description:
          "Verifies the browser WebAuthn response signature and saves credential to user keys.",
        body: passkeyRegisterVerifyRequestSchema,
        response: {
          200: jsonResponse(
            "Passkey registered successfully.",
            authMessageResponseSchema,
          ),
          400: errorResponse(
            "Verification challenge expired or validation failed.",
          ),
          401: errorResponse("Unauthorized."),
        },
      },
      preHandler: context.authenticated,
    },
    controller.registerVerify,
  );

  app.post(
    "/auth/passkey/login/options",
    {
      schema: {
        operationId: "getPasskeyLoginOptions",
        tags: ["Auth"],
        summary: "Generate Passkey Login Options",
        description:
          "Creates options challenge payload to complete WebAuthn login assertion.",
        response: {
          200: jsonResponse(
            "Passkey options challenge.",
            passkeyOptionsResponseSchema,
          ),
          401: errorResponse("Unauthorized."),
        },
      },
      preHandler: context.authenticated,
    },
    controller.loginOptions,
  );

  app.post(
    "/auth/passkey/login/verify",
    {
      schema: {
        operationId: "verifyPasskeyLogin",
        tags: ["Auth"],
        summary: "Verify Passkey Login Response",
        description:
          "Verifies browser WebAuthn assertion signature, completing step-up MFA login.",
        body: passkeyLoginVerifyRequestSchema,
        response: {
          200: jsonResponse(
            "Passkey verified successfully.",
            authMessageResponseSchema,
          ),
          400: errorResponse(
            "Challenge expired or passkey credential missing.",
          ),
          401: errorResponse("Incorrect code or signature validation failed."),
        },
      },
      preHandler: context.authenticated,
    },
    controller.loginVerify,
  );
};

export default mfaRoutes;
