import { z } from "zod";

import {
  AFFILIATE_COMMISSION_FLAGS,
  AFFILIATE_COMMISSION_KINDS,
  AFFILIATE_COMMISSION_STATUSES,
  AFFILIATE_PAYOUT_METHODS,
  AFFILIATE_PAYOUT_STATUSES,
  AFFILIATE_RATE_TYPES,
  AFFILIATE_RULE_TARGET_TYPES,
  AFFILIATE_STATUSES,
  affiliateCodeSchema,
  affiliateMoneySchema,
} from "./commission.ts";
import { affiliateProgramSettingsSchema } from "./program-settings.ts";

/**
 * The academy admin's side of the affiliate program (PRD section 13.3):
 * settings and rules, the affiliates, the commission ledger, payouts and
 * reports. Reads need `affiliate.read`; changes `affiliate.manage`; money
 * and payout details `affiliate.payout`.
 */

const listLimit = z.coerce.number().int().min(1).max(100).default(25);
const cursor = z.string().max(200).optional();
const reasonSchema = z.string().trim().min(3).max(2000);

// ------------------------------------------------------------ settings, rules

export const affiliateRuleSchema = z.strictObject({
  id: z.uuid(),
  affiliateId: z.uuid().nullable(),
  /** The affiliate's code, upper case, for display. */
  affiliateCode: z.string().nullable(),
  targetType: z.enum(AFFILIATE_RULE_TARGET_TYPES).nullable(),
  targetId: z.uuid().nullable(),
  /** The product's title; null for every product, or a product since deleted. */
  targetTitle: z.string().nullable(),
  rateType: z.enum(AFFILIATE_RATE_TYPES),
  rateValue: z.number().int(),
  currency: z.string().nullable(),
  createdAt: z.string(),
});
export type AffiliateRule = z.infer<typeof affiliateRuleSchema>;

export const affiliateRulesResponseSchema = z.strictObject({
  items: z.array(affiliateRuleSchema),
});
export type AffiliateRulesResponse = z.infer<
  typeof affiliateRulesResponseSchema
>;

export const affiliateAdminSettingsResponseSchema = z.strictObject({
  settings: affiliateProgramSettingsSchema,
  /** The rule every affiliate earns by unless a more specific one applies. */
  defaultRule: affiliateRuleSchema.nullable(),
});
export type AffiliateAdminSettingsResponse = z.infer<
  typeof affiliateAdminSettingsResponseSchema
>;

/** Something a rule can be limited to, for the rule form's product picker. */
export const affiliateProductOptionSchema = z.strictObject({
  targetType: z.enum(AFFILIATE_RULE_TARGET_TYPES),
  targetId: z.uuid(),
  title: z.string(),
});
export const affiliateProductOptionsResponseSchema = z.strictObject({
  items: z.array(affiliateProductOptionSchema),
});
export type AffiliateProductOption = z.infer<
  typeof affiliateProductOptionSchema
>;

// ------------------------------------------------------------ affiliates

export const adminAffiliatesQuerySchema = z.strictObject({
  status: z.enum(AFFILIATE_STATUSES).optional(),
  /** Matches the code, name or email. */
  q: z.string().trim().max(100).optional(),
  cursor,
  limit: listLimit,
});
export type AdminAffiliatesQuery = z.input<typeof adminAffiliatesQuerySchema>;

export const adminAffiliateRowSchema = z.strictObject({
  id: z.uuid(),
  code: z.string(),
  status: z.enum(AFFILIATE_STATUSES),
  /** The account's name; null for an invitation not yet accepted. */
  name: z.string().nullable(),
  email: z.string().nullable(),
  /** Set for an invitation not yet accepted. */
  invitedEmail: z.string().nullable(),
  createdAt: z.string(),
  clicks: z.number().int(),
  sales: z.number().int(),
  earned: affiliateMoneySchema,
  available: affiliateMoneySchema,
  /** Pending commissions held by a flag. */
  flagged: z.number().int(),
});
export type AdminAffiliateRow = z.infer<typeof adminAffiliateRowSchema>;

export const adminAffiliatesResponseSchema = z.strictObject({
  items: z.array(adminAffiliateRowSchema),
  nextCursor: z.string().nullable(),
});
export type AdminAffiliatesResponse = z.infer<
  typeof adminAffiliatesResponseSchema
>;

export const adminAffiliateDetailSchema = adminAffiliateRowSchema.extend({
  /** The applicant's own words; shown as plain text. */
  applicationNote: z.string().nullable(),
  statusReason: z.string().nullable(),
  decidedAt: z.string().nullable(),
  termsAcceptedAt: z.string().nullable(),
  /** The personal coupon, when the program gives buyers a discount. */
  coupon: z.strictObject({ code: z.string(), active: z.boolean() }).nullable(),
  balances: z.strictObject({
    pending: affiliateMoneySchema,
    available: affiliateMoneySchema,
    inPayout: affiliateMoneySchema,
    paid: affiliateMoneySchema,
  }),
  payoutDetails: z
    .strictObject({
      method: z.enum(AFFILIATE_PAYOUT_METHODS),
      hint: z.string(),
      panLast4: z.string().nullable(),
    })
    .nullable(),
  notifyOnCommission: z.boolean(),
});
export type AdminAffiliateDetail = z.infer<typeof adminAffiliateDetailSchema>;

export const inviteAffiliateRequestSchema = z.strictObject({
  email: z.email().trim().toLowerCase().max(254),
  /** The code to give them; one is made from the email if left out. */
  code: affiliateCodeSchema.optional(),
});
export type InviteAffiliateRequest = z.input<
  typeof inviteAffiliateRequestSchema
>;

/** Approve and reinstate take nothing; reject and suspend need a reason. */
export const affiliateStatusChangeRequestSchema = z.strictObject({
  reason: reasonSchema.optional(),
});
export type AffiliateStatusChangeRequest = z.infer<
  typeof affiliateStatusChangeRequestSchema
>;
export const AFFILIATE_STATUS_ACTIONS = [
  "approve",
  "reject",
  "suspend",
  "reinstate",
] as const;
export type AffiliateStatusAction = (typeof AFFILIATE_STATUS_ACTIONS)[number];

/** The full payout details, for whoever pays. Every read is audited. */
export const adminPayoutDetailsResponseSchema = z.strictObject({
  method: z.enum(AFFILIATE_PAYOUT_METHODS),
  upiId: z.string().nullable(),
  holderName: z.string().nullable(),
  accountNumber: z.string().nullable(),
  ifsc: z.string().nullable(),
  pan: z.string().nullable(),
});
export type AdminPayoutDetailsResponse = z.infer<
  typeof adminPayoutDetailsResponseSchema
>;

// ------------------------------------------------------------ commissions

export const adminCommissionsQuerySchema = z.strictObject({
  status: z.enum(AFFILIATE_COMMISSION_STATUSES).optional(),
  kind: z.enum(AFFILIATE_COMMISSION_KINDS).optional(),
  affiliateId: z.uuid().optional(),
  /** Only rows held by a flag. */
  flagged: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  cursor,
  limit: listLimit,
});
export type AdminCommissionsQuery = z.infer<typeof adminCommissionsQuerySchema>;
export type AdminCommissionsQueryInput = z.input<
  typeof adminCommissionsQuerySchema
>;

export const adminCommissionRowSchema = z.strictObject({
  id: z.uuid(),
  kind: z.enum(AFFILIATE_COMMISSION_KINDS),
  status: z.enum(AFFILIATE_COMMISSION_STATUSES),
  flags: z.array(z.enum(AFFILIATE_COMMISSION_FLAGS)),
  inPayout: z.boolean(),
  paid: z.boolean(),
  affiliate: z.strictObject({
    id: z.uuid(),
    name: z.string().nullable(),
    code: z.string(),
  }),
  order: z
    .strictObject({
      id: z.uuid(),
      number: z.string(),
      /** Masked: "r••••@gmail.com". */
      buyer: z.string().nullable(),
    })
    .nullable(),
  item: z.string().nullable(),
  base: affiliateMoneySchema.nullable(),
  rate: z
    .strictObject({ type: z.enum(AFFILIATE_RATE_TYPES), value: z.number() })
    .nullable(),
  amount: affiliateMoneySchema,
  payoutAmount: affiliateMoneySchema.nullable(),
  note: z.string().nullable(),
  availableAt: z.string(),
  createdAt: z.string(),
});
export type AdminCommissionRow = z.infer<typeof adminCommissionRowSchema>;

export const adminCommissionsResponseSchema = z.strictObject({
  items: z.array(adminCommissionRowSchema),
  nextCursor: z.string().nullable(),
});
export type AdminCommissionsResponse = z.infer<
  typeof adminCommissionsResponseSchema
>;

export const rejectCommissionRequestSchema = z.strictObject({
  reason: reasonSchema,
});
export type RejectCommissionRequest = z.infer<
  typeof rejectCommissionRequestSchema
>;

/** A manual plus or minus row in rupees; owed at once. */
export const affiliateAdjustmentRequestSchema = z.strictObject({
  affiliateId: z.uuid(),
  amountMinor: z
    .number()
    .int()
    .refine((value) => value !== 0, "An adjustment can't be zero")
    .refine(
      (value) => Math.abs(value) <= 100_000_000,
      "That is more than ₹10 lakh",
    ),
  note: reasonSchema,
});
export type AffiliateAdjustmentRequest = z.infer<
  typeof affiliateAdjustmentRequestSchema
>;

/** Credits an order to another affiliate, or to none, while it is pending. */
export const setOrderAttributionRequestSchema = z.strictObject({
  affiliateId: z.uuid().nullable(),
  note: z.string().trim().max(2000).optional(),
});
export type SetOrderAttributionRequest = z.infer<
  typeof setOrderAttributionRequestSchema
>;
export const setOrderAttributionResponseSchema = z.strictObject({
  orderId: z.uuid(),
  affiliateId: z.uuid().nullable(),
  /** Commissions written for the new affiliate. */
  commissions: z.number().int(),
});
export type SetOrderAttributionResponse = z.infer<
  typeof setOrderAttributionResponseSchema
>;

// ------------------------------------------------------------ payouts

export const adminPayoutsQuerySchema = z.strictObject({
  status: z.enum(AFFILIATE_PAYOUT_STATUSES).optional(),
  affiliateId: z.uuid().optional(),
  cursor,
  limit: listLimit,
});
export type AdminPayoutsQuery = z.input<typeof adminPayoutsQuerySchema>;

export const adminPayoutSchema = z.strictObject({
  id: z.uuid(),
  status: z.enum(AFFILIATE_PAYOUT_STATUSES),
  affiliate: z.strictObject({
    id: z.uuid(),
    name: z.string().nullable(),
    code: z.string(),
  }),
  gross: affiliateMoneySchema,
  tds: affiliateMoneySchema,
  net: affiliateMoneySchema,
  method: z.enum(AFFILIATE_PAYOUT_METHODS),
  hint: z.string().nullable(),
  requestedBy: z.enum(["affiliate", "admin"]),
  reference: z.string().nullable(),
  paidOn: z.string().nullable(),
  reason: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: z.string(),
  decidedAt: z.string().nullable(),
  /**
   * For an open payout when the academy deducts TDS: what was paid to this
   * affiliate so far in the financial year, and the suggested deduction.
   */
  tdsSuggestion: z
    .strictObject({
      yearPaid: affiliateMoneySchema,
      suggested: affiliateMoneySchema,
      /** Basis points: 200 (2%) or 2000 (20% without a PAN). */
      rate: z.number().int(),
      panOnFile: z.boolean(),
      /** Earlier payouts this year may also need TDS now the limit is crossed. */
      crossesThreshold: z.boolean(),
    })
    .nullable(),
});
export type AdminPayout = z.infer<typeof adminPayoutSchema>;

export const adminPayoutsResponseSchema = z.strictObject({
  items: z.array(adminPayoutSchema),
  nextCursor: z.string().nullable(),
});
export type AdminPayoutsResponse = z.infer<typeof adminPayoutsResponseSchema>;

/** Payouts for chosen affiliates, or for every one above the minimum. */
export const createAdminPayoutsRequestSchema = z.union([
  z.strictObject({ affiliateIds: z.array(z.uuid()).min(1).max(200) }),
  z.strictObject({ allAboveMinimum: z.literal(true) }),
]);
export type CreateAdminPayoutsRequest = z.infer<
  typeof createAdminPayoutsRequestSchema
>;

export const AFFILIATE_PAYOUT_SKIP_REASONS = [
  "not_approved",
  "payout_open",
  "details_missing",
  "below_minimum",
] as const;

export const createAdminPayoutsResponseSchema = z.strictObject({
  created: z.array(adminPayoutSchema),
  skipped: z.array(
    z.strictObject({
      affiliateId: z.uuid(),
      code: z.string(),
      reason: z.enum(AFFILIATE_PAYOUT_SKIP_REASONS),
    }),
  ),
});
export type CreateAdminPayoutsResponse = z.infer<
  typeof createAdminPayoutsResponseSchema
>;

export const markPayoutPaidRequestSchema = z.strictObject({
  /** UTR or UPI reference. */
  reference: z.string().trim().min(3).max(100),
  paidOn: z.iso.date(),
  /** Tax withheld; the suggestion when left out (zero with TDS off). */
  tdsMinor: z.number().int().min(0).optional(),
  note: z.string().trim().max(2000).optional(),
});
export type MarkPayoutPaidRequest = z.infer<typeof markPayoutPaidRequestSchema>;

export const closePayoutRequestSchema = z.strictObject({
  reason: reasonSchema,
});
export type ClosePayoutRequest = z.infer<typeof closePayoutRequestSchema>;

// ------------------------------------------------------------ reports, audit

export const affiliateReportQuerySchema = z.strictObject({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});
export type AffiliateReportQuery = z.infer<typeof affiliateReportQuerySchema>;

/** The Overview tab (PRD section 17.1) and its health panel (section 16). */
export const affiliateReportSummarySchema = z.strictObject({
  from: z.string(),
  to: z.string(),
  affiliateSales: affiliateMoneySchema,
  /** Affiliate sales ÷ all sales; null with no sales. */
  shareOfRevenue: z.number().nullable(),
  orders: z.number().int(),
  clicks: z.number().int(),
  conversionRate: z.number().nullable(),
  commissionEarned: affiliateMoneySchema,
  owedNow: affiliateMoneySchema,
  pending: affiliateMoneySchema,
  paidOut: affiliateMoneySchema,
  activeAffiliates: z.number().int(),
  pendingApplications: z.number().int(),
  topAffiliates: z.array(
    z.strictObject({
      id: z.uuid(),
      code: z.string(),
      name: z.string().nullable(),
      orders: z.number().int(),
      earned: affiliateMoneySchema,
    }),
  ),
  health: z.strictObject({
    heldByFlag: z.number().int(),
    waitingForSettlement: z.number().int(),
    payoutsOpenOverAWeek: z.number().int(),
  }),
});
export type AffiliateReportSummary = z.infer<
  typeof affiliateReportSummarySchema
>;

export const affiliateExportQuerySchema = z.strictObject({
  type: z.enum(["commissions", "affiliates"]),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});
export type AffiliateExportQuery = z.infer<typeof affiliateExportQuerySchema>;

export const affiliatePayoutExportQuerySchema = z.strictObject({
  status: z.enum(AFFILIATE_PAYOUT_STATUSES).default("requested"),
});
export type AffiliatePayoutExportQuery = z.input<
  typeof affiliatePayoutExportQuerySchema
>;

export const affiliateAuditQuerySchema = z.strictObject({
  subjectId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type AffiliateAuditQuery = z.input<typeof affiliateAuditQuerySchema>;

export const affiliateAuditEntrySchema = z.strictObject({
  id: z.uuid(),
  action: z.string(),
  subjectType: z.string(),
  subjectId: z.uuid(),
  actorName: z.string().nullable(),
  data: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});
export const affiliateAuditResponseSchema = z.strictObject({
  items: z.array(affiliateAuditEntrySchema),
});
export type AffiliateAuditEntry = z.infer<typeof affiliateAuditEntrySchema>;
