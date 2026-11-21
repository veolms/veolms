import {
  adminAffiliateDetailSchema,
  adminAffiliatesQuerySchema,
  adminAffiliatesResponseSchema,
  adminCommissionRowSchema,
  adminCommissionsQuerySchema,
  adminCommissionsResponseSchema,
  adminPayoutDetailsResponseSchema,
  adminPayoutSchema,
  adminPayoutsQuerySchema,
  adminPayoutsResponseSchema,
  affiliateAdjustmentRequestSchema,
  affiliateAdminSettingsResponseSchema,
  affiliateAuditQuerySchema,
  affiliateAuditResponseSchema,
  affiliateCommissionRuleInputSchema,
  affiliateExportQuerySchema,
  affiliatePayoutExportQuerySchema,
  affiliateProductOptionsResponseSchema,
  affiliateReportQuerySchema,
  affiliateReportSummarySchema,
  affiliateRuleSchema,
  affiliateRulesResponseSchema,
  affiliateStatusChangeRequestSchema,
  closePayoutRequestSchema,
  createAdminPayoutsRequestSchema,
  createAdminPayoutsResponseSchema,
  inviteAffiliateRequestSchema,
  markPayoutPaidRequestSchema,
  rejectCommissionRequestSchema,
  setOrderAttributionRequestSchema,
  setOrderAttributionResponseSchema,
  updateAffiliateProgramSettingsRequestSchema,
  type Permission,
} from "@veolms/contracts";
import { z } from "zod";

import { errorResponse } from "../../lib/errors.ts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import { createPermissionPreHandlers } from "../authorization/index.ts";
import { createPlatformSettingsService } from "../platform/index.ts";
import { createAffiliateAdminController } from "./affiliate-admin.controller.ts";
import { createAffiliateAdminService } from "./affiliate-admin.service.ts";
import { createAffiliatePayoutsAdminService } from "./affiliate-payouts-admin.service.ts";

/**
 * The academy admin's affiliate routes (PRD section 13.3). Signed in with
 * two-factor and holding the permission; ids from another academy are not
 * found (row-level security in the cloud, the one academy in core).
 */
const affiliateAdminRoutes: RoutePlugin = async (app, options) => {
  const { requires } = createPermissionPreHandlers(options.database);
  const platformSettings = createPlatformSettingsService({
    database: options.database,
  });
  const service = createAffiliateAdminService({
    database: options.database,
    platformSettings,
    email: options.services.email,
    log: app.log,
  });
  const payouts = createAffiliatePayoutsAdminService({
    database: options.database,
    platformSettings,
  });
  const controller = createAffiliateAdminController({ service, payouts });
  const tags = ["Affiliates - Admin"];
  const id = z.object({ id: z.uuid() });
  const denied = {
    401: errorResponse("Authentication required"),
    403: errorResponse("Missing permission"),
  };
  const notFound = { 404: errorResponse("Not found") };
  const guard = (permission: Permission) => ({
    preHandler: requires(permission),
  });

  // ---------------------------------------------------------- settings, rules

  app.get(
    "/affiliates/settings",
    {
      ...guard("affiliate.read"),
      schema: {
        operationId: "getAffiliateProgramSettings",
        tags,
        summary: "The program's settings and default rate",
        response: {
          200: jsonResponse("Settings", affiliateAdminSettingsResponseSchema),
          ...denied,
        },
      },
    },
    controller.getSettings,
  );

  app.put(
    "/affiliates/settings",
    {
      ...guard("affiliate.manage"),
      schema: {
        operationId: "updateAffiliateProgramSettings",
        tags,
        summary: "Change the program's settings",
        description:
          "Switching the program on adds a 20% default rate if there is none; changing the buyer discount changes every affiliate's coupon.",
        body: updateAffiliateProgramSettingsRequestSchema,
        response: {
          200: jsonResponse("Saved", affiliateAdminSettingsResponseSchema),
          ...denied,
        },
      },
    },
    controller.updateSettings,
  );

  app.get(
    "/affiliates/rules",
    {
      ...guard("affiliate.read"),
      schema: {
        operationId: "listAffiliateRules",
        tags,
        summary: "The live commission rules",
        response: {
          200: jsonResponse("Rules", affiliateRulesResponseSchema),
          ...denied,
        },
      },
    },
    controller.listRules,
  );

  app.put(
    "/affiliates/rules",
    {
      ...guard("affiliate.manage"),
      schema: {
        operationId: "setAffiliateRule",
        tags,
        summary: "Set the rule for one scope",
        description:
          "Archives the live rule for the same affiliate and product (if any) and adds this one; commissions keep the rule they were worked out with.",
        body: affiliateCommissionRuleInputSchema,
        response: {
          200: jsonResponse("The new rule", affiliateRuleSchema),
          ...denied,
          ...notFound,
        },
      },
    },
    controller.setRule,
  );

  app.delete(
    "/affiliates/rules/:id",
    {
      ...guard("affiliate.manage"),
      schema: {
        operationId: "archiveAffiliateRule",
        tags,
        summary: "Archive a rule (not the program default)",
        params: id,
        response: {
          200: jsonResponse(
            "Archived",
            z.strictObject({ message: z.string() }),
          ),
          ...denied,
          ...notFound,
          409: errorResponse("DEFAULT_RULE"),
        },
      },
    },
    controller.deleteRule,
  );

  app.get(
    "/affiliates/products",
    {
      ...guard("affiliate.read"),
      schema: {
        operationId: "listAffiliateProductOptions",
        tags,
        summary: "Products a rule can be limited to",
        response: {
          200: jsonResponse("Products", affiliateProductOptionsResponseSchema),
          ...denied,
        },
      },
    },
    controller.listProducts,
  );

  // ---------------------------------------------------------- reports, audit
  // Static paths before /affiliates/:id (they would not match a uuid anyway).

  app.get(
    "/affiliates/reports/summary",
    {
      ...guard("affiliate.read"),
      schema: {
        operationId: "getAffiliateReportSummary",
        tags,
        summary: "The Overview tab's numbers and health panel",
        querystring: affiliateReportQuerySchema,
        response: {
          200: jsonResponse("Summary", affiliateReportSummarySchema),
          ...denied,
        },
      },
    },
    controller.summary,
  );

  app.get(
    "/affiliates/reports/export",
    {
      ...guard("affiliate.read"),
      schema: {
        operationId: "exportAffiliateReport",
        tags,
        summary: "Commissions or affiliates as CSV",
        querystring: affiliateExportQuerySchema,
        response: { ...denied },
      },
    },
    controller.exportReport,
  );

  app.get(
    "/affiliates/audit",
    {
      ...guard("affiliate.read"),
      schema: {
        operationId: "listAffiliateAudit",
        tags,
        summary: "Who changed what in the program, newest first",
        querystring: affiliateAuditQuerySchema,
        response: {
          200: jsonResponse("Audit entries", affiliateAuditResponseSchema),
          ...denied,
        },
      },
    },
    controller.listAudit,
  );

  // ---------------------------------------------------------- commissions

  app.get(
    "/affiliates/commissions",
    {
      ...guard("affiliate.read"),
      schema: {
        operationId: "listAffiliateCommissionsAdmin",
        tags,
        summary: "The ledger across affiliates",
        querystring: adminCommissionsQuerySchema,
        response: {
          200: jsonResponse("Commissions", adminCommissionsResponseSchema),
          ...denied,
        },
      },
    },
    controller.listCommissions,
  );

  app.post(
    "/affiliates/commissions/adjustments",
    {
      ...guard("affiliate.manage"),
      schema: {
        operationId: "addAffiliateAdjustment",
        tags,
        summary: "Add a manual plus or minus row, with a note",
        body: affiliateAdjustmentRequestSchema,
        response: {
          201: jsonResponse("The adjustment", adminCommissionRowSchema),
          ...denied,
          ...notFound,
        },
      },
    },
    controller.addAdjustment,
  );

  app.post(
    "/affiliates/commissions/:id/approve",
    {
      ...guard("affiliate.manage"),
      schema: {
        operationId: "approveAffiliateCommission",
        tags,
        summary: "Approve a pending commission now",
        params: id,
        response: {
          200: jsonResponse("Approved", adminCommissionRowSchema),
          ...denied,
          ...notFound,
          409: errorResponse(
            "COMMISSION_NOT_PENDING, SALE_STILL_PENDING or NO_SETTLEMENT",
          ),
        },
      },
    },
    controller.approveCommission,
  );

  app.post(
    "/affiliates/commissions/:id/reject",
    {
      ...guard("affiliate.manage"),
      schema: {
        operationId: "rejectAffiliateCommission",
        tags,
        summary: "Reject a pending commission, with a reason",
        params: id,
        body: rejectCommissionRequestSchema,
        response: {
          200: jsonResponse("Rejected", adminCommissionRowSchema),
          ...denied,
          ...notFound,
          409: errorResponse("COMMISSION_NOT_PENDING"),
        },
      },
    },
    controller.rejectCommission,
  );

  app.put(
    "/affiliates/orders/:orderId/attribution",
    {
      ...guard("affiliate.manage"),
      schema: {
        operationId: "setAffiliateOrderAttribution",
        tags,
        summary: "Credit an order to another affiliate, or to none",
        params: z.object({ orderId: z.uuid() }),
        body: setOrderAttributionRequestSchema,
        response: {
          200: jsonResponse("Changed", setOrderAttributionResponseSchema),
          ...denied,
          ...notFound,
          409: errorResponse("COMMISSIONS_LOCKED or ORDER_NOT_CREDITABLE"),
          422: errorResponse("NOT_APPROVED or SELF_REFERRAL"),
        },
      },
    },
    controller.setOrderAttribution,
  );

  // ---------------------------------------------------------- payouts

  app.get(
    "/affiliates/payouts",
    {
      ...guard("affiliate.read"),
      schema: {
        operationId: "listAffiliatePayoutsAdmin",
        tags,
        summary: "Payouts, with suggested TDS for open ones",
        querystring: adminPayoutsQuerySchema,
        response: {
          200: jsonResponse("Payouts", adminPayoutsResponseSchema),
          ...denied,
        },
      },
    },
    controller.listPayouts,
  );

  app.get(
    "/affiliates/payouts/export",
    {
      ...guard("affiliate.payout"),
      schema: {
        operationId: "exportAffiliatePayouts",
        tags,
        summary: "Payouts with full payment details as CSV (audited)",
        querystring: affiliatePayoutExportQuerySchema,
        response: { ...denied },
      },
    },
    controller.exportPayouts,
  );

  app.post(
    "/affiliates/payouts",
    {
      ...guard("affiliate.payout"),
      schema: {
        operationId: "createAffiliatePayouts",
        tags,
        summary:
          "Create payouts for chosen affiliates, or all above the minimum",
        body: createAdminPayoutsRequestSchema,
        response: {
          200: jsonResponse(
            "Created and skipped",
            createAdminPayoutsResponseSchema,
          ),
          ...denied,
        },
      },
    },
    controller.createPayouts,
  );

  app.post(
    "/affiliates/payouts/:id/mark-paid",
    {
      ...guard("affiliate.payout"),
      schema: {
        operationId: "markAffiliatePayoutPaid",
        tags,
        summary: "Mark a payout paid with its reference and date",
        params: id,
        body: markPayoutPaidRequestSchema,
        response: {
          200: jsonResponse("Paid", adminPayoutSchema),
          ...denied,
          ...notFound,
          409: errorResponse("PAYOUT_NOT_OPEN"),
          422: errorResponse("TDS_TOO_HIGH"),
        },
      },
    },
    controller.markPaid,
  );

  for (const status of ["rejected", "failed"] as const) {
    const verb = status === "rejected" ? "reject" : "fail";
    app.post(
      `/affiliates/payouts/:id/${verb}`,
      {
        ...guard("affiliate.payout"),
        schema: {
          operationId:
            status === "rejected"
              ? "rejectAffiliatePayout"
              : "failAffiliatePayout",
          tags,
          summary:
            status === "rejected"
              ? "Reject a payout; its rows go back to the balance"
              : "Mark a payout failed; its rows go back to the balance",
          params: id,
          body: closePayoutRequestSchema,
          response: {
            200: jsonResponse("Closed", adminPayoutSchema),
            ...denied,
            ...notFound,
            409: errorResponse("PAYOUT_NOT_OPEN"),
          },
        },
      },
      controller.closePayout(status),
    );
  }

  // ---------------------------------------------------------- affiliates

  app.get(
    "/affiliates",
    {
      ...guard("affiliate.read"),
      schema: {
        operationId: "listAffiliates",
        tags,
        summary: "Affiliates with their totals",
        querystring: adminAffiliatesQuerySchema,
        response: {
          200: jsonResponse("Affiliates", adminAffiliatesResponseSchema),
          ...denied,
        },
      },
    },
    controller.listAffiliates,
  );

  app.post(
    "/affiliates/invitations",
    {
      ...guard("affiliate.manage"),
      schema: {
        operationId: "inviteAffiliate",
        tags,
        summary: "Invite someone by email",
        body: inviteAffiliateRequestSchema,
        response: {
          201: jsonResponse("The invitation", adminAffiliateDetailSchema),
          ...denied,
          409: errorResponse(
            "ALREADY_AFFILIATE, ALREADY_INVITED or CODE_TAKEN",
          ),
        },
      },
    },
    controller.invite,
  );

  app.get(
    "/affiliates/:id",
    {
      ...guard("affiliate.read"),
      schema: {
        operationId: "getAffiliate",
        tags,
        summary: "One affiliate with balances",
        params: id,
        response: {
          200: jsonResponse("The affiliate", adminAffiliateDetailSchema),
          ...denied,
          ...notFound,
        },
      },
    },
    controller.getAffiliate,
  );

  for (const action of ["approve", "reject", "suspend", "reinstate"] as const) {
    app.post(
      `/affiliates/:id/${action}`,
      {
        ...guard("affiliate.manage"),
        schema: {
          operationId: `${action}Affiliate`,
          tags,
          summary:
            action === "reject" || action === "suspend"
              ? `${action[0]!.toUpperCase()}${action.slice(1)} an affiliate (a reason is required)`
              : `${action[0]!.toUpperCase()}${action.slice(1)} an affiliate`,
          params: id,
          body: affiliateStatusChangeRequestSchema.optional(),
          response: {
            200: jsonResponse("The affiliate", adminAffiliateDetailSchema),
            ...denied,
            ...notFound,
            409: errorResponse("STATUS_CHANGED or INVITATION_NOT_ACCEPTED"),
            422: errorResponse("REASON_REQUIRED"),
          },
        },
      },
      controller.changeStatus(action),
    );
  }

  app.get(
    "/affiliates/:id/payout-details",
    {
      ...guard("affiliate.payout"),
      schema: {
        operationId: "getAffiliatePayoutDetails",
        tags,
        summary: "Full payout details, decrypted (every read is audited)",
        params: id,
        response: {
          200: jsonResponse("Payout details", adminPayoutDetailsResponseSchema),
          ...denied,
          ...notFound,
          503: errorResponse("Encryption is not set up on this server"),
        },
      },
    },
    controller.getPayoutDetails,
  );
};

export default affiliateAdminRoutes;
