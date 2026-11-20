import { z } from "zod";

import { AFFILIATE_RATE_TYPES } from "./commission.ts";
import { publicAffiliateProgramSchema } from "./program-settings.ts";

/** The cookie that remembers a visit through an affiliate's link. */
export const AFFILIATE_CLICK_COOKIE = "veo_aff";

/** The query parameter that makes any page an affiliate's link: ?ref=RAHUL. */
export const AFFILIATE_REF_PARAM = "ref";

/** The join page's facts, with the default rate when the program has one. */
export const publicAffiliateProgramResponseSchema =
  publicAffiliateProgramSchema.extend({
    defaultRate: z
      .strictObject({
        rateType: z.enum(AFFILIATE_RATE_TYPES),
        /** Percent: basis points (2000 = 20%). Fixed: minor units. */
        rateValue: z.number().int(),
        currency: z.string().length(3).nullable(),
      })
      .nullable(),
  });
export type PublicAffiliateProgramResponse = z.infer<
  typeof publicAffiliateProgramResponseSchema
>;

/**
 * A visit through an affiliate's link, sent once by the page that read
 * `?ref=`. The code is checked by pattern before anything is looked up.
 */
export const recordAffiliateClickRequestSchema = z.strictObject({
  code: z.string().trim().min(1).max(40),
  /** The path the visitor landed on, without the query string. */
  landingPath: z.string().trim().max(500).default("/"),
  /** document.referrer; only its host is kept. */
  referrer: z.string().trim().max(2000).nullable().optional(),
});
export type RecordAffiliateClickRequest = z.input<
  typeof recordAffiliateClickRequestSchema
>;

/**
 * The same answer whether or not the code belongs to anyone, so codes
 * cannot be listed through this endpoint.
 */
export const affiliateTrackingAckSchema = z.strictObject({
  ok: z.literal(true),
});
export type AffiliateTrackingAck = z.infer<typeof affiliateTrackingAckSchema>;
