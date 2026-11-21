import {
  affiliateApplyRequestSchema,
  affiliateCommissionsQuerySchema,
  affiliateCommissionsResponseSchema,
  affiliateMeResponseSchema,
  affiliatePayoutDetailsRequestSchema,
  affiliatePayoutSchema,
  affiliatePayoutsQuerySchema,
  affiliatePayoutsResponseSchema,
  affiliateStatsQuerySchema,
  affiliateStatsResponseSchema,
  updateAffiliateMeRequestSchema,
} from "@veolms/contracts";

import { errorResponse } from "../../lib/errors.ts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import { createPermissionPreHandlers } from "../authorization/index.ts";
import { createPlatformSettingsService } from "../platform/index.ts";
import { createAffiliateAccountController } from "./affiliate-account.controller.ts";
import { createAffiliateAccountService } from "./affiliate-account.service.ts";

/**
 * The affiliate's own side (PRD section 13.2). Signed in; every route works
 * on the caller's own record, found from their account.
 */
const affiliateAccountRoutes: RoutePlugin = async (app, options) => {
  const { middleware } = createPermissionPreHandlers(options.database);
  const signedIn = [middleware.authenticate, middleware.requireAuthenticated];
  const service = createAffiliateAccountService({
    database: options.database,
    platformSettings: createPlatformSettingsService({
      database: options.database,
    }),
  });
  const controller = createAffiliateAccountController({ service });
  const tags = ["Affiliates"];
  const common = {
    401: errorResponse("Authentication required"),
    404: errorResponse("Not an affiliate (NOT_AN_AFFILIATE)"),
  };
  const perUser = (max: number) => ({
    rateLimit: {
      max,
      timeWindow: "1 minute",
      hook: "preHandler" as const,
      keyGenerator: (request: { user?: { id: string } | null; ip: string }) =>
        request.user?.id ?? request.ip,
    },
  });

  app.post(
    "/affiliate/apply",
    {
      config: perUser(10),
      preHandler: signedIn,
      schema: {
        operationId: "applyAffiliate",
        tags,
        summary: "Join the affiliate program, or accept an invitation",
        body: affiliateApplyRequestSchema,
        response: {
          200: jsonResponse(
            "The caller's affiliate record",
            affiliateMeResponseSchema,
          ),
          401: errorResponse("Authentication required"),
          403: errorResponse("The program is closed (PROGRAM_CLOSED)"),
          409: errorResponse("CODE_TAKEN or REAPPLY_TOO_SOON"),
          429: errorResponse("Too many requests"),
        },
      },
    },
    controller.apply,
  );

  app.get(
    "/affiliate/me",
    {
      preHandler: signedIn,
      schema: {
        operationId: "getAffiliateMe",
        tags,
        summary: "The affiliate dashboard: status, link, rules and balances",
        response: {
          200: jsonResponse(
            "The caller's affiliate record",
            affiliateMeResponseSchema,
          ),
          ...common,
        },
      },
    },
    controller.getMe,
  );

  app.patch(
    "/affiliate/me",
    {
      preHandler: signedIn,
      schema: {
        operationId: "updateAffiliateMe",
        tags,
        summary: "Change the code (while pending) or the commission email",
        body: updateAffiliateMeRequestSchema,
        response: {
          200: jsonResponse("Updated", affiliateMeResponseSchema),
          ...common,
          409: errorResponse("CODE_TAKEN or CODE_LOCKED"),
        },
      },
    },
    controller.updateMe,
  );

  app.put(
    "/affiliate/me/payout-details",
    {
      config: perUser(10),
      preHandler: signedIn,
      schema: {
        operationId: "setAffiliatePayoutDetails",
        tags,
        summary: "Set UPI or bank details and PAN",
        description:
          "Stored encrypted with a key used for nothing else; only a masked hint is ever sent back.",
        body: affiliatePayoutDetailsRequestSchema,
        response: {
          200: jsonResponse(
            "Saved; only the hint is returned",
            affiliateMeResponseSchema,
          ),
          ...common,
          429: errorResponse("Too many requests"),
          503: errorResponse("Encryption is not set up on this server"),
        },
      },
    },
    controller.setPayoutDetails,
  );

  app.delete(
    "/affiliate/me/payout-details",
    {
      preHandler: signedIn,
      schema: {
        operationId: "deleteAffiliatePayoutDetails",
        tags,
        summary: "Remove payout details (not while a payout is open)",
        response: {
          200: jsonResponse("Removed", affiliateMeResponseSchema),
          ...common,
          409: errorResponse("PAYOUT_ALREADY_OPEN"),
        },
      },
    },
    controller.deletePayoutDetails,
  );

  app.get(
    "/affiliate/me/stats",
    {
      preHandler: signedIn,
      schema: {
        operationId: "getAffiliateStats",
        tags,
        summary: "Clicks, sales and earnings, by day and by product",
        querystring: affiliateStatsQuerySchema,
        response: {
          200: jsonResponse("Stats", affiliateStatsResponseSchema),
          ...common,
        },
      },
    },
    controller.getStats,
  );

  app.get(
    "/affiliate/me/commissions",
    {
      preHandler: signedIn,
      schema: {
        operationId: "listAffiliateCommissions",
        tags,
        summary: "Every ledger row, newest first; buyers masked",
        querystring: affiliateCommissionsQuerySchema,
        response: {
          200: jsonResponse(
            "A page of the ledger",
            affiliateCommissionsResponseSchema,
          ),
          ...common,
        },
      },
    },
    controller.listCommissions,
  );

  app.get(
    "/affiliate/me/payouts",
    {
      preHandler: signedIn,
      schema: {
        operationId: "listAffiliatePayouts",
        tags,
        summary: "Payout history",
        querystring: affiliatePayoutsQuerySchema,
        response: {
          200: jsonResponse(
            "Payouts, newest first",
            affiliatePayoutsResponseSchema,
          ),
          ...common,
        },
      },
    },
    controller.listPayouts,
  );

  app.post(
    "/affiliate/me/payouts",
    {
      config: perUser(5),
      preHandler: signedIn,
      schema: {
        operationId: "requestAffiliatePayout",
        tags,
        summary: "Request a payout of the whole available balance",
        description:
          "Needs an Idempotency-Key header: a repeat with the same key returns the same payout.",
        response: {
          200: jsonResponse(
            "The payout this key already made",
            affiliatePayoutSchema,
          ),
          201: jsonResponse("Requested", affiliatePayoutSchema),
          400: errorResponse("IDEMPOTENCY_KEY_REQUIRED"),
          ...common,
          403: errorResponse("NOT_APPROVED"),
          409: errorResponse("PAYOUT_ALREADY_OPEN"),
          422: errorResponse("BELOW_MINIMUM_PAYOUT or PAYOUT_DETAILS_MISSING"),
          429: errorResponse("Too many requests"),
        },
      },
    },
    controller.requestPayout,
  );
};

export default affiliateAccountRoutes;
