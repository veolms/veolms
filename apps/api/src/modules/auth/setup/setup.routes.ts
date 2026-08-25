import {
  academyRequestSchema,
  academyResponseSchema,
  authMessageResponseSchema,
  creatorRegisterRequestSchema,
  loginResponseSchema,
  setupTokenRequestSchema,
} from "@veolms/contracts";

import { errorResponse } from "../../../lib/errors.ts";
import { jsonResponse } from "../../../lib/responses.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { createAuthContext } from "../shared/auth.context.ts";
import { createSetupController } from "./setup.controller.ts";

const setupRoutes: RoutePlugin = async (app, options) => {
  const context = createAuthContext(options);
  const controller = createSetupController(context);

  app.post(
    "/auth/verify-token",
    {
      schema: {
        operationId: "verifySetupToken",
        tags: ["Auth"],
        summary: "Verify setup token",
        description:
          "Checks if the provided token matches the installation setup token.",
        body: setupTokenRequestSchema,
        response: {
          200: jsonResponse(
            "Token verified successfully.",
            authMessageResponseSchema,
          ),
          401: errorResponse("Invalid setup token."),
          403: errorResponse("Setup already completed."),
        },
      },
    },
    controller.verifyToken,
  );

  app.post(
    "/auth/creator/register",
    {
      schema: {
        operationId: "registerCreator",
        tags: ["Auth"],
        summary: "Specialized Creator onboarding",
        description:
          "Registers the first user on the platform as Creator. Disallowed if accounts exist.",
        body: creatorRegisterRequestSchema,
        response: {
          201: jsonResponse(
            "Creator initialized successfully.",
            loginResponseSchema,
          ),
          401: errorResponse("Setup session missing or expired."),
          403: errorResponse("Creator already initialized."),
        },
      },
    },
    controller.registerCreator,
  );

  app.post(
    "/auth/academy",
    {
      schema: {
        operationId: "setupAcademy",
        tags: ["Auth"],
        summary: "Configure academy brand details",
        description:
          "Saves the academy brand configuration during platform setup.",
        body: academyRequestSchema,
        response: {
          200: jsonResponse(
            "Academy brand saved successfully.",
            academyResponseSchema,
          ),
          401: errorResponse("Setup session missing or expired."),
          403: errorResponse("Setup already completed."),
        },
      },
    },
    controller.academy,
  );

  app.post(
    "/auth/setup/finish",
    {
      schema: {
        operationId: "finalizeSetup",
        tags: ["Auth"],
        summary: "Finalize platform setup",
        description: "Locks the platform setup, completing installation.",
        response: {
          200: jsonResponse(
            "Setup finalized successfully.",
            authMessageResponseSchema,
          ),
          400: errorResponse("Academy configuration or creator missing."),
          401: errorResponse("Setup session missing or expired."),
          403: errorResponse("Setup already completed."),
        },
      },
    },
    controller.finish,
  );
};

export default setupRoutes;
