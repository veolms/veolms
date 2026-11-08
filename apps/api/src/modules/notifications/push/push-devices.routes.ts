import {
  pushDeviceFidParamsSchema,
  pushDeviceRegisteredSchema,
  pushDeviceRemovedSchema,
  registerPushDeviceSchema,
} from "@veolms/contracts";

import { config } from "../../../config.ts";
import { errorResponse } from "../../../lib/errors.ts";
import { jsonResponse } from "../../../lib/responses.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { createAuthMiddleware } from "../../../middlewares/auth.middleware.ts";
import { createSessionService } from "../../auth/index.ts";
import { pushAppsFor } from "./push-apps.ts";
import { createPushDeviceController } from "./push-devices.controller.ts";
import { createPushDeviceService } from "./push-devices.service.ts";

const pushDeviceRoutes: RoutePlugin = async (app, options) => {
  const sessionService = createSessionService({ database: options.database });
  const middleware = createAuthMiddleware(sessionService);
  const requireAuthenticated = [
    middleware.authenticate,
    middleware.requireAuthenticated,
    middleware.requireMfaVerified,
  ];
  const controller = createPushDeviceController({
    service: createPushDeviceService({
      database: options.database,
      apps: pushAppsFor(config.PUSH_APPS),
      pushEnabled: config.PUSH_ENABLED,
      maxDevicesPerUser: config.PUSH_MAX_DEVICES_PER_USER,
    }),
  });

  app.put(
    "/me/push-devices",
    {
      preHandler: requireAuthenticated,
      schema: {
        operationId: "registerMyPushDevice",
        tags: ["Notifications"],
        summary: "Register or refresh this app install for push",
        description:
          "Call after login, on every app start and whenever the Firebase " +
          "Installation ID changes (then with previousFid). The latest " +
          "login owns the install.",
        body: registerPushDeviceSchema,
        response: {
          200: jsonResponse("Install registered", pushDeviceRegisteredSchema),
          400: errorResponse("Unknown app or invalid install"),
          401: errorResponse("Authentication required"),
        },
      },
    },
    controller.register,
  );

  app.delete(
    "/me/push-devices/:fid",
    {
      preHandler: requireAuthenticated,
      schema: {
        operationId: "removeMyPushDevice",
        tags: ["Notifications"],
        summary: "Stop pushes to this app install (call on logout)",
        params: pushDeviceFidParamsSchema,
        response: {
          200: jsonResponse("Install removed", pushDeviceRemovedSchema),
          401: errorResponse("Authentication required"),
        },
      },
    },
    controller.unregister,
  );
};

export default pushDeviceRoutes;
