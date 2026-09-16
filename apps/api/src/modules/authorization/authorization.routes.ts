import {
  capabilitiesQuerySchema,
  capabilitiesResponseSchema,
} from "@veolms/contracts";
import { errorResponse } from "../../lib/errors.ts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import { createAuthMiddleware } from "../../middlewares/auth.middleware.ts";
import { createSessionService } from "../auth/session/session.service.ts";
import { createAuthorizationController } from "./authorization.controller.ts";
import { createAuthorizationService } from "./authorization.service.ts";

const authorizationRoutes: RoutePlugin = async (app, options) => {
  const sessionService = createSessionService({ database: options.database });
  const middleware = createAuthMiddleware(sessionService);
  const service = createAuthorizationService(options.database);
  const controller = createAuthorizationController({ service });

  app.get(
    "/me/capabilities",
    {
      schema: {
        operationId: "getCapabilities",
        tags: ["Authorization"],
        summary: "Get effective permissions and platform features",
        description:
          "Returns all effective scoped permissions and platform feature entitlements for UI capability checking.",
        querystring: capabilitiesQuerySchema,
        response: {
          200: jsonResponse(
            "Effective permissions and feature states.",
            capabilitiesResponseSchema,
          ),
          401: errorResponse("Authentication required."),
          403: errorResponse("MFA step-up required."),
        },
      },
      preHandler: [
        middleware.authenticate,
        middleware.requireAuthenticated,
        middleware.requireMfaVerified,
      ],
    },
    controller.getCapabilities,
  );
};

export default authorizationRoutes;
