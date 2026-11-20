import {
  affiliateTrackingAckSchema,
  publicAffiliateProgramResponseSchema,
  recordAffiliateClickRequestSchema,
} from "@veolms/contracts";
import { normalizeIP } from "@fastify/rate-limit";

import { config } from "../../config.ts";
import { errorResponse } from "../../lib/errors.ts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import { createPermissionPreHandlers } from "../authorization/index.ts";
import { createPlatformSettingsService } from "../platform/index.ts";
import { createAffiliateTrackingController } from "./affiliate-tracking.controller.ts";
import { createAffiliateTrackingService } from "./affiliate-tracking.service.ts";

/**
 * Referral tracking (PRD section 11): the join page's facts, the visit
 * through an affiliate's link, and tying that visit to the account that
 * signs in. None of these is on the checkout path, and the page never
 * waits for them.
 */
const affiliateTrackingRoutes: RoutePlugin = async (app, options) => {
  const { middleware } = createPermissionPreHandlers(options.database);
  const service = createAffiliateTrackingService({
    database: options.database,
    platformSettings: createPlatformSettingsService({
      database: options.database,
    }),
    serverSecret: config.SESSION_SECRET,
  });
  const controller = createAffiliateTrackingController({ service });
  const tags = ["Affiliates"];

  app.get(
    "/affiliate/program",
    {
      schema: {
        operationId: "getPublicAffiliateProgram",
        tags,
        summary: "The affiliate program's public facts",
        description:
          "What the join page shows: whether the program is open, how people join, the default rate, the attribution window, the hold period, the minimum payout, the buyer discount and the terms.",
        response: {
          200: jsonResponse(
            "The program's public facts",
            publicAffiliateProgramResponseSchema,
          ),
        },
      },
    },
    controller.getPublicProgram,
  );

  app.post(
    "/affiliate/clicks",
    {
      bodyLimit: 1024,
      config: {
        rateLimit: {
          max: 30,
          timeWindow: "1 minute",
          keyGenerator: (request) => normalizeIP(request.ip),
        },
      },
      preHandler: middleware.authenticate,
      schema: {
        operationId: "recordAffiliateClick",
        tags,
        summary: "Record a visit through an affiliate's link",
        description:
          "Sent once by the page that read ?ref=. Records the click and sets the signed veo_aff cookie for the attribution window. Answers the same for an unknown code, so codes cannot be listed.",
        body: recordAffiliateClickRequestSchema,
        response: {
          200: jsonResponse("Received", affiliateTrackingAckSchema),
          429: errorResponse("Too many requests"),
        },
      },
    },
    controller.recordClick,
  );

  app.post(
    "/affiliate/referrals/claim",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute",
          hook: "preHandler",
          keyGenerator: (request) =>
            request.user?.id ?? normalizeIP(request.ip),
        },
      },
      preHandler: [middleware.authenticate, middleware.requireAuthenticated],
      schema: {
        operationId: "claimAffiliateReferral",
        tags,
        summary: "Tie the visitor's affiliate click to their account",
        description:
          "Called once after signing in or signing up, so a purchase made later on another device is still credited. Does nothing without a valid click cookie.",
        response: {
          200: jsonResponse("Received", affiliateTrackingAckSchema),
          401: errorResponse("Authentication required"),
          429: errorResponse("Too many requests"),
        },
      },
    },
    controller.claimReferral,
  );
};

export default affiliateTrackingRoutes;
