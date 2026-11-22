import { normalizeIP } from "@fastify/rate-limit";
import {
  pushDeviceRemovedSchema,
  registerWebPushSubscriptionSchema,
  webPushConfigSchema,
  webPushSubscriptionEndpointSchema,
  webPushSubscriptionRegisteredSchema,
  webPushTestResultSchema,
} from "@veolms/contracts";
import type { FastifyRequest } from "fastify";

import { config } from "../../../config.ts";
import { errorResponse } from "../../../lib/errors.ts";
import { jsonResponse } from "../../../lib/responses.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { createAuthMiddleware } from "../../../middlewares/auth.middleware.ts";
import { createSessionService } from "../../auth/index.ts";
import { createWebPushClient } from "./web-push.client.ts";
import { createWebPushController } from "./web-push.controller.ts";
import { createWebPushService } from "./web-push.service.ts";
import { webPushSetup } from "./web-push.setup.ts";

function perUser(max: number, timeWindow: string) {
  return {
    max,
    timeWindow,
    hook: "preHandler",
    keyGenerator: (request: FastifyRequest) =>
      request.user?.id ?? normalizeIP(request.ip),
  } as const;
}

const tags = ["Notifications"];

const webPushRoutes: RoutePlugin = async (app, options) => {
  const sessionService = createSessionService({ database: options.database });
  const middleware = createAuthMiddleware(sessionService);
  const signedIn = [
    middleware.authenticate,
    middleware.requireAuthenticated,
    middleware.requireMfaVerified,
  ];
  const setup = webPushSetup(config);
  const controller = createWebPushController({
    service: createWebPushService({
      database: options.database,
      setup,
      pushEnabled: config.PUSH_ENABLED,
      client: setup.vapid ? createWebPushClient({ vapid: setup.vapid }) : null,
      maxDevicesPerUser: config.PUSH_MAX_DEVICES_PER_USER,
    }),
  });

  app.get(
    "/me/web-push",
    {
      preHandler: signedIn,
      schema: {
        operationId: "getWebPushConfig",
        tags,
        summary: "Whether browsers can subscribe, and the key to use",
        response: {
          200: jsonResponse("Web push settings", webPushConfigSchema),
          401: errorResponse("Authentication required"),
        },
      },
    },
    controller.config,
  );

  app.put(
    "/me/web-push/subscription",
    {
      config: { rateLimit: perUser(30, "10 minutes") },
      // A list of its own: the rate limiter is added to the list it is given.
      preHandler: [...signedIn],
      schema: {
        operationId: "saveMyWebPushSubscription",
        tags,
        summary: "Save this browser's push subscription for chat messages",
        description:
          "Send PushSubscription.toJSON() after subscribing and on each " +
          "visit; with previousEndpoint when the browser replaced it. The " +
          "latest account and login own the browser.",
        body: registerWebPushSubscriptionSchema,
        response: {
          200: jsonResponse(
            "Subscription saved",
            webPushSubscriptionRegisteredSchema,
          ),
          400: errorResponse("Push service not supported"),
          401: errorResponse("Authentication required"),
          409: errorResponse("Web push is turned off"),
        },
      },
    },
    controller.register,
  );

  app.post(
    "/me/web-push/subscription/remove",
    {
      preHandler: signedIn,
      schema: {
        operationId: "removeMyWebPushSubscription",
        tags,
        summary: "Stop pushes to this browser (turned off, or signing out)",
        body: webPushSubscriptionEndpointSchema,
        response: {
          200: jsonResponse("Subscription removed", pushDeviceRemovedSchema),
          401: errorResponse("Authentication required"),
        },
      },
    },
    controller.remove,
  );

  app.post(
    "/me/web-push/test",
    {
      config: { rateLimit: perUser(5, "10 minutes") },
      preHandler: [...signedIn],
      schema: {
        operationId: "sendMyWebPushTest",
        tags,
        summary: "Send a test notification to this browser, now",
        body: webPushSubscriptionEndpointSchema,
        response: {
          200: jsonResponse(
            "What the push service said",
            webPushTestResultSchema,
          ),
          401: errorResponse("Authentication required"),
        },
      },
    },
    controller.test,
  );
};

export default webPushRoutes;
