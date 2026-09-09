import { sidenavResponseSchema } from "@veolms/contracts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import { createAuthMiddleware } from "../../middlewares/auth.middleware.ts";
import { createSessionService } from "../auth/session/session.service.ts";
import { createNavigationController } from "./navigation.controller.ts";
import { createNavigationService } from "./navigation.service.ts";

const navigationRoutes: RoutePlugin = async (app, options) => {
  const sessionService = createSessionService({ database: options.database });
  const middleware = createAuthMiddleware(sessionService);
  const service = createNavigationService({ database: options.database });
  const controller = createNavigationController({ service });

  app.get(
    "/navigation/sidenav",
    {
      schema: {
        operationId: "getSidenav",
        tags: ["Navigation"],
        summary: "Get sidenav menus and permissions",
        description:
          "Returns accessible navigation menu nodes, capability permission keys, and assigned roles for the current user or guest.",
        response: {
          200: jsonResponse(
            "Sidenav menus, permissions, and roles.",
            sidenavResponseSchema,
          ),
        },
      },
      preHandler: [middleware.authenticate],
    },
    controller.getSidenav,
  );
};

export default navigationRoutes;
