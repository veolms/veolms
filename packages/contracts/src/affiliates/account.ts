import { z } from "zod";

import {
  AFFILIATE_ATTRIBUTION_SOURCES,
  AFFILIATE_COMMISSION_KINDS,
  AFFILIATE_COMMISSION_STATUSES,
  AFFILIATE_PAYOUT_METHODS,
  AFFILIATE_PAYOUT_STATUSES,
  AFFILIATE_RATE_TYPES,
  AFFILIATE_STATUSES,
  affiliateCodeSchema,
  affiliateMoneySchema,
} from "./commission.ts";
import { csvOf, pageSize } from "./list-params.ts";
import { AFFILIATE_JOIN_MODES } from "./program-settings.ts";

/**
 * The affiliate's own side (PRD section 13.2): applying, the dashboard, the
 * history, payout details and payout requests. Every route works on the
 * caller's own record; an affiliate id is never taken from the request.
 */

export const AFFILIATE_APPLICATION_NOTE_MAX = 1000;

/** Applying, or accepting an invitation (the same call). */
export const affiliateApplyRequestSchema = z.strictObject({
  /** The code they would like; one is suggested from their name if left out. */
  code: affiliateCodeSchema.optional(),
  /** How they will promote the academy. */
  applicationNote: z
    .string()
    .trim()
    .max(AFFILIATE_APPLICATION_NOTE_MAX)
    .optional(),
  acceptTerms: z.literal(true, {
    message: "Read and accept the terms to join",
  }),
});
export type AffiliateApplyRequest = z.input<typeof affiliateApplyRequestSchema>;

export const affiliatePayoutDetailsSummarySchema = z.strictObject({
  method: z.enum(AFFILIATE_PAYOUT_METHODS),
  /** Masked: "UPI r••••@okhdfc", "A/c ••••1234". */
  hint: z.string(),
  panLast4: z.string().nullable(),
});

export const affiliateMeResponseSchema = z.strictObject({
  status: z.enum(AFFILIATE_STATUSES),
  code: z.string(),
  /** The academy's home page with ?ref=CODE; any page works the same way. */
  link: z.string(),
  /** Set when an application was rejected or the affiliate suspended. */
  statusReason: z.string().nullable(),
  /** A rejected applicant may apply again from this moment. */
  reapplyAfter: z.string().nullable(),
  notifyOnCommission: z.boolean(),
  program: z.strictObject({
    joinMode: z.enum(AFFILIATE_JOIN_MODES),
    defaultRate: z
      .strictObject({
        rateType: z.enum(AFFILIATE_RATE_TYPES),
        rateValue: z.number().int(),
        currency: z.string().nullable(),
      })
      .nullable(),
    attributionWindowDays: z.number().int(),
    holdDays: z.number().int(),
    minPayout: affiliateMoneySchema,
    buyerDiscountPercent: z.number().int(),
    termsText: z.string(),
  }),
  balances: z.strictObject({
    pending: affiliateMoneySchema,
    available: affiliateMoneySchema,
    inPayout: affiliateMoneySchema,
    paid: affiliateMoneySchema,
  }),
  payoutDetails: affiliatePayoutDetailsSummarySchema.nullable(),
  /** False with the reason, so the button can say why. */
  canRequestPayout: z.boolean(),
  payoutBlockedReason: z
    .enum(["below_minimum", "details_missing", "payout_open", "not_approved"])
    .nullable(),
});
export type AffiliateMeResponse = z.infer<typeof affiliateMeResponseSchema>;

/** What the affiliate may change about themselves. */
export const updateAffiliateMeRequestSchema = z
  .strictObject({
    /** Only while the application is pending. */
    code: affiliateCodeSchema.optional(),
    notifyOnCommission: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Nothing to change");
export type UpdateAffiliateMeRequest = z.input<
  typeof updateAffiliateMeRequestSchema
>;

export const AFFILIATE_UPI_PATTERN = /^[A-Za-z0-9._-]{2,256}@[A-Za-z]{2,64}$/u;
export const AFFILIATE_IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/u;
export const AFFILIATE_ACCOUNT_NUMBER_PATTERN = /^[0-9]{9,18}$/u;
export const AFFILIATE_PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/u;

const panSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(AFFILIATE_PAN_PATTERN, "Enter a 10-character PAN, such as ABCDE1234F");

/** UPI, or a bank account; PAN is asked for by both. */
export const affiliatePayoutDetailsRequestSchema = z.discriminatedUnion(
  "method",
  [
    z.strictObject({
      method: z.literal("upi"),
      upiId: z
        .string()
        .trim()
        .regex(AFFILIATE_UPI_PATTERN, "Enter a UPI id, such as name@okhdfc"),
      pan: panSchema.nullable(),
    }),
    z.strictObject({
      method: z.literal("bank"),
      holderName: z.string().trim().min(2).max(120),
      accountNumber: z
        .string()
        .trim()
        .regex(
          AFFILIATE_ACCOUNT_NUMBER_PATTERN,
          "Enter the account number, 9 to 18 digits",
        ),
      ifsc: z
        .string()
        .trim()
        .toUpperCase()
        .regex(
          AFFILIATE_IFSC_PATTERN,
          "Enter an 11-character IFSC, such as HDFC0001234",
        ),
      pan: panSchema.nullable(),
    }),
  ],
);
export type AffiliatePayoutDetailsRequest = z.input<
  typeof affiliatePayoutDetailsRequestSchema
>;

export const affiliateStatsQuerySchema = z.strictObject({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});
export type AffiliateStatsQuery = z.infer<typeof affiliateStatsQuerySchema>;

export const affiliateStatsResponseSchema = z.strictObject({
  from: z.string(),
  to: z.string(),
  clicks: z.number().int(),
  sales: z.number().int(),
  /** Sales ÷ clicks; null with no clicks. */
  conversionRate: z.number().nullable(),
  earned: affiliateMoneySchema,
  byDay: z.array(
    z.strictObject({
      date: z.string(),
      clicks: z.number().int(),
      sales: z.number().int(),
      earnedMinor: z.number().int(),
    }),
  ),
  byProduct: z.array(
    z.strictObject({
      title: z.string(),
      sales: z.number().int(),
      earnedMinor: z.number().int(),
    }),
  ),
});
export type AffiliateStatsResponse = z.infer<
  typeof affiliateStatsResponseSchema
>;

/**
 * Where a commission stands, as the affiliate sees it: waiting out the
 * refund period (or a review), available to withdraw, in a payout, paid,
 * or rejected.
 */
export const AFFILIATE_VIEW_STATES = [
  "waiting",
  "available",
  "in_payout",
  "paid",
  "rejected",
] as const;
export type AffiliateViewState = (typeof AFFILIATE_VIEW_STATES)[number];

export const affiliateCommissionsQuerySchema = z.strictObject({
  status: z.enum(AFFILIATE_COMMISSION_STATUSES).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  /** With a page, the list pages by number and the filters below apply. */
  page: z.coerce.number().int().min(1).max(10_000).optional(),
  pageSize,
  /** One or more of AFFILIATE_VIEW_STATES, comma separated. */
  states: csvOf(AFFILIATE_VIEW_STATES).optional(),
  kinds: csvOf(AFFILIATE_COMMISSION_KINDS).optional(),
  /** Earned on or after / on or before (IST days). */
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  /** Matches the order number. */
  q: z.string().trim().max(100).optional(),
});
export type AffiliateCommissionsQueryParsed = z.infer<
  typeof affiliateCommissionsQuerySchema
>;
export type AffiliateCommissionsQuery = z.input<
  typeof affiliateCommissionsQuerySchema
>;

export const affiliateCommissionRowSchema = z.strictObject({
  id: z.uuid(),
  createdAt: z.string(),
  kind: z.enum(AFFILIATE_COMMISSION_KINDS),
  status: z.enum(AFFILIATE_COMMISSION_STATUSES),
  /** "In payout" and "paid" are shown from these. */
  inPayout: z.boolean(),
  paid: z.boolean(),
  product: z.string().nullable(),
  orderNumber: z.string().nullable(),
  /** First name and masked email only: "Asha (a••••@gmail.com)". */
  buyer: z.string().nullable(),
  source: z.enum(AFFILIATE_ATTRIBUTION_SOURCES).nullable(),
  base: affiliateMoneySchema.nullable(),
  rateType: z.enum(AFFILIATE_RATE_TYPES).nullable(),
  rateValue: z.number().int().nullable(),
  amount: affiliateMoneySchema,
  /** In rupees; null until a foreign-currency commission is approved. */
  payoutAmount: affiliateMoneySchema.nullable(),
  availableAt: z.string(),
  /** Why it was rejected or adjusted. */
  note: z.string().nullable(),
});
export type AffiliateCommissionRow = z.infer<
  typeof affiliateCommissionRowSchema
>;

const viewCountAndAmount = z.strictObject({
  count: z.number().int(),
  /** In rupees (the amount the affiliate is paid). */
  amount: affiliateMoneySchema,
});

export const affiliateCommissionsResponseSchema = z.strictObject({
  items: z.array(affiliateCommissionRowSchema),
  nextCursor: z.string().nullable(),
  /** Set when the list was asked for by page. */
  total: z.number().int().optional(),
  page: z.number().int().optional(),
  pageCount: z.number().int().optional(),
  /** Every state for the other filters, for the summary tiles. */
  summary: z
    .strictObject({
      waiting: viewCountAndAmount,
      available: viewCountAndAmount,
      inPayout: viewCountAndAmount,
      paid: viewCountAndAmount,
      rejected: viewCountAndAmount,
    })
    .optional(),
});
export type AffiliateCommissionsResponse = z.infer<
  typeof affiliateCommissionsResponseSchema
>;

export const affiliatePayoutSchema = z.strictObject({
  id: z.uuid(),
  status: z.enum(AFFILIATE_PAYOUT_STATUSES),
  gross: affiliateMoneySchema,
  tds: affiliateMoneySchema,
  net: affiliateMoneySchema,
  method: z.enum(AFFILIATE_PAYOUT_METHODS),
  hint: z.string().nullable(),
  reference: z.string().nullable(),
  paidOn: z.string().nullable(),
  /** Why it was rejected or failed. */
  reason: z.string().nullable(),
  createdAt: z.string(),
});
export type AffiliatePayout = z.infer<typeof affiliatePayoutSchema>;

export const affiliatePayoutsQuerySchema = z.strictObject({
  /** With a page, the list pages by number and the filters below apply. */
  page: z.coerce.number().int().min(1).max(10_000).optional(),
  pageSize,
  statuses: csvOf(AFFILIATE_PAYOUT_STATUSES).optional(),
  /** Asked for on or after / on or before (IST days). */
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});
export type AffiliatePayoutsQuery = z.infer<typeof affiliatePayoutsQuerySchema>;
export type AffiliatePayoutsQueryInput = z.input<
  typeof affiliatePayoutsQuerySchema
>;

export const affiliatePayoutsResponseSchema = z.strictObject({
  items: z.array(affiliatePayoutSchema),
  /** Set when the list was asked for by page. */
  total: z.number().int().optional(),
  page: z.number().int().optional(),
  pageCount: z.number().int().optional(),
});
export type AffiliatePayoutsResponse = z.infer<
  typeof affiliatePayoutsResponseSchema
>;
