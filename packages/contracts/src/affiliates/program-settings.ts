import { z } from "zod";

/**
 * The academy's affiliate program: who may join, how long a click counts,
 * how long a commission waits before it is owed, and the smallest payout.
 * Stored as the `affiliates` section of the platform settings document, but
 * never sent with the public settings and changed only by staff holding
 * `affiliate.manage` (its own endpoint, not the Platform page's).
 */

/** How people become affiliates. */
export const AFFILIATE_JOIN_MODES = [
  "invite_only",
  "open_with_approval",
  "open_auto_approve",
] as const;
export type AffiliateJoinMode = (typeof AFFILIATE_JOIN_MODES)[number];

export const AFFILIATE_ATTRIBUTION_WINDOW_DAYS = { min: 1, max: 365 } as const;
export const AFFILIATE_HOLD_DAYS = { min: 0, max: 90 } as const;
export const AFFILIATE_BUYER_DISCOUNT_PERCENT = { min: 0, max: 50 } as const;
export const AFFILIATE_TERMS_MAX = 10_000;

export const DEFAULT_AFFILIATE_TERMS = [
  "You earn a commission on each paid purchase made through your link or code.",
  "A commission is held until the refund period is over. If the purchase is refunded, the commission is reversed, even after it was paid; a reversal is taken from your next payout.",
  "You may not buy through your own link or code, and you may not bid on the academy's name in paid ads.",
  "The academy may suspend an affiliate who breaks these terms. Commissions already owed are still paid unless they came from a broken term.",
].join("\n\n");

export const affiliateProgramSettingsSchema = z.strictObject({
  /** Off: no new clicks or attributions. Earned commissions still mature and are paid. */
  enabled: z.boolean(),
  joinMode: z.enum(AFFILIATE_JOIN_MODES),
  /** How long a click can still earn credit for a purchase. */
  attributionWindowDays: z
    .number()
    .int()
    .min(AFFILIATE_ATTRIBUTION_WINDOW_DAYS.min)
    .max(AFFILIATE_ATTRIBUTION_WINDOW_DAYS.max),
  /** How long a commission waits before it is owed (the refund window). */
  holdDays: z
    .number()
    .int()
    .min(AFFILIATE_HOLD_DAYS.min)
    .max(AFFILIATE_HOLD_DAYS.max),
  /** The smallest payout an affiliate may ask for, in the academy's minor units. */
  minPayoutMinor: z.number().int().min(0),
  /** Above zero: each affiliate's code also works as a coupon for this much off. */
  buyerDiscountPercent: z
    .number()
    .int()
    .min(AFFILIATE_BUYER_DISCOUNT_PERCENT.min)
    .max(AFFILIATE_BUYER_DISCOUNT_PERCENT.max),
  termsText: z.string().trim().max(AFFILIATE_TERMS_MAX),
  /** Suggest TDS on payouts (only some academies must deduct it). */
  tdsEnabled: z.boolean(),
});
export type AffiliateProgramSettings = z.infer<
  typeof affiliateProgramSettingsSchema
>;

/** What a new program starts with (PRD decision D-8). */
export const DEFAULT_AFFILIATE_PROGRAM_SETTINGS: AffiliateProgramSettings = {
  enabled: false,
  joinMode: "open_with_approval",
  attributionWindowDays: 30,
  holdDays: 30,
  minPayoutMinor: 50_000,
  buyerDiscountPercent: 0,
  termsText: DEFAULT_AFFILIATE_TERMS,
  tdsEnabled: false,
};

/** Changes one or more program settings; what is left out keeps its value. */
export const updateAffiliateProgramSettingsRequestSchema =
  affiliateProgramSettingsSchema
    .partial()
    .refine((value) => Object.keys(value).length > 0, "Nothing to change");
export type UpdateAffiliateProgramSettingsRequest = z.infer<
  typeof updateAffiliateProgramSettingsRequestSchema
>;

/** The few numbers the public join page shows. */
export const publicAffiliateProgramSchema = affiliateProgramSettingsSchema.pick(
  {
    enabled: true,
    joinMode: true,
    attributionWindowDays: true,
    holdDays: true,
    minPayoutMinor: true,
    buyerDiscountPercent: true,
    termsText: true,
  },
);
export type PublicAffiliateProgram = z.infer<
  typeof publicAffiliateProgramSchema
>;
