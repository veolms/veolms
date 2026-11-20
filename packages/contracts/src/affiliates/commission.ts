import { z } from "zod";

/**
 * The words of the affiliate ledger (PRD sections 9 and 12). Kept in
 * contracts so the API, the admin pages and the affiliate dashboard name
 * every state the same way.
 */

export const AFFILIATE_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "suspended",
] as const;
export type AffiliateStatus = (typeof AFFILIATE_STATUSES)[number];

/** A sale, the reversal of (part of) a sale after a refund, or an admin's correction. */
export const AFFILIATE_COMMISSION_KINDS = [
  "sale",
  "reversal",
  "adjustment",
] as const;
export type AffiliateCommissionKind =
  (typeof AFFILIATE_COMMISSION_KINDS)[number];

export const AFFILIATE_COMMISSION_STATUSES = [
  "pending",
  "approved",
  "rejected",
] as const;
export type AffiliateCommissionStatus =
  (typeof AFFILIATE_COMMISSION_STATUSES)[number];

/** Why a commission waits for a person instead of being approved on time. */
export const AFFILIATE_COMMISSION_FLAGS = [
  "email_match",
  "phone_match",
  "ip_match",
  "high_refund_rate",
  "affiliate_suspended",
  "no_settlement",
] as const;
export type AffiliateCommissionFlag =
  (typeof AFFILIATE_COMMISSION_FLAGS)[number];

/** How a purchase was credited to an affiliate. */
export const AFFILIATE_ATTRIBUTION_SOURCES = [
  "code",
  "link",
  "account",
  "manual",
] as const;
export type AffiliateAttributionSource =
  (typeof AFFILIATE_ATTRIBUTION_SOURCES)[number];

export const AFFILIATE_PAYOUT_STATUSES = [
  "requested",
  "paid",
  "rejected",
  "failed",
] as const;
export type AffiliatePayoutStatus = (typeof AFFILIATE_PAYOUT_STATUSES)[number];

export const AFFILIATE_PAYOUT_METHODS = ["upi", "bank"] as const;
export type AffiliatePayoutMethod = (typeof AFFILIATE_PAYOUT_METHODS)[number];

/** What a rule can be limited to; none means every product. */
export const AFFILIATE_RULE_TARGET_TYPES = [
  "course",
  "bundle",
  "workshop",
  "quiz",
] as const;
export type AffiliateRuleTargetType =
  (typeof AFFILIATE_RULE_TARGET_TYPES)[number];

export const AFFILIATE_RATE_TYPES = ["percent", "fixed"] as const;
export type AffiliateRateType = (typeof AFFILIATE_RATE_TYPES)[number];

/** Percentages are stored in basis points: 2000 is 20%. */
export const AFFILIATE_PERCENT_BASIS_POINTS_MAX = 10_000;

/**
 * An affiliate's code: 3 to 20 letters, digits or hyphens, compared without
 * case and stored in lower case. It never changes after approval.
 */
export const AFFILIATE_CODE_PATTERN = /^[A-Za-z0-9-]{3,20}$/u;
export const affiliateCodeSchema = z
  .string()
  .trim()
  .regex(AFFILIATE_CODE_PATTERN, "Use 3 to 20 letters, digits or hyphens")
  .transform((code) => code.toLowerCase());

/** Money on the wire: always whole minor units with their currency. */
export const affiliateMoneySchema = z.strictObject({
  amountMinor: z.number().int(),
  currency: z.string().length(3),
});
export type AffiliateMoney = z.infer<typeof affiliateMoneySchema>;

/**
 * A commission rule as an admin writes it. Rules are never edited: a change
 * archives the old rule and adds a new one, so every commission keeps the
 * rule it was worked out with.
 */
export const affiliateCommissionRuleInputSchema = z
  .strictObject({
    /** Empty: every affiliate. */
    affiliateId: z.uuid().nullable(),
    /** Empty: every product. */
    targetType: z.enum(AFFILIATE_RULE_TARGET_TYPES).nullable(),
    targetId: z.uuid().nullable(),
    rateType: z.enum(AFFILIATE_RATE_TYPES),
    /** Percent: basis points (0 to 10,000). Fixed: minor units. */
    rateValue: z.number().int().min(0),
    /** Required for a fixed rule; the rule applies only to orders in it. */
    currency: z.string().length(3).toUpperCase().nullable(),
  })
  .refine((rule) => (rule.targetType === null) === (rule.targetId === null), {
    message: "Choose a product, or leave both product fields empty",
    path: ["targetId"],
  })
  .refine(
    (rule) =>
      rule.rateType === "fixed" ||
      rule.rateValue <= AFFILIATE_PERCENT_BASIS_POINTS_MAX,
    { message: "A percentage is at most 100%", path: ["rateValue"] },
  )
  .refine((rule) => rule.rateType === "percent" || rule.currency !== null, {
    message: "A fixed amount needs a currency",
    path: ["currency"],
  });
export type AffiliateCommissionRuleInput = z.infer<
  typeof affiliateCommissionRuleInputSchema
>;
