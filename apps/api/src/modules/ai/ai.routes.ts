import {
  aiAvailabilitySchema,
  aiSettingsResponseSchema,
  testAiConnectionResponseSchema,
  updateAiSettingsRequestSchema,
} from "@veolms/contracts";
import { errorResponse } from "../../lib/errors.ts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import { createAuthContext } from "../auth/shared/auth.context.ts";
import { createPermissionPreHandlers } from "../authorization/index.ts";
import { createAiController } from "./ai.controller.ts";
import { createAiService } from "./ai.service.ts";

const tags = ["AI"];
const errors = {
  400: errorResponse("Invalid request"),
  401: errorResponse("Authentication required"),
  403: errorResponse("Forbidden"),
};

/** Platform → AI: whether AI is on, the provider, model, key and budget. */
const aiRoutes: RoutePlugin = async (app, options) => {
  const auth = createAuthContext(options);
  const { requires } = createPermissionPreHandlers(options.database);
  const controller = createAiController(
    createAiService({
      database: options.database,
      authService: auth.authService,
    }),
  );

  app.get(
    "/platform/ai-settings",
    {
      preHandler: requires("platform.settings.read"),
      schema: {
        operationId: "getAiSettings",
        tags,
        summary: "AI settings and this month's usage",
        response: {
          200: jsonResponse("AI settings", aiSettingsResponseSchema),
          ...errors,
        },
      },
    },
    controller.getSettings,
  );
  app.patch(
    "/platform/ai-settings",
    {
      preHandler: requires("platform.settings.update"),
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
      schema: {
        operationId: "updateAiSettings",
        tags,
        summary: "Change the AI settings",
        description:
          "Saves the fields sent. The API key is write-only: it is stored encrypted and never returned.",
        body: updateAiSettingsRequestSchema,
        response: {
          200: jsonResponse("AI settings", aiSettingsResponseSchema),
          ...errors,
        },
      },
    },
    controller.updateSettings,
  );
  app.post(
    "/platform/ai-settings/test",
    {
      preHandler: requires("platform.settings.update"),
      config: { rateLimit: { max: 6, timeWindow: "1 minute" } },
      schema: {
        operationId: "testAiConnection",
        tags,
        summary: "Make one tiny AI call with the saved settings",
        response: {
          200: jsonResponse("What happened", testAiConnectionResponseSchema),
          ...errors,
        },
      },
    },
    controller.testConnection,
  );
  // Staff screens ask before showing AI buttons. Anyone who may write
  // course content may ask; it says nothing secret.
  app.get(
    "/ai/availability",
    {
      preHandler: requires("coding.manage", "platform"),
      schema: {
        operationId: "getAiAvailability",
        tags,
        summary: "Whether AI features can be used now",
        response: {
          200: jsonResponse("Availability", aiAvailabilitySchema),
          ...errors,
        },
      },
    },
    controller.availability,
  );
};

export default aiRoutes;
