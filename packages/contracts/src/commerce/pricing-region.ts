import { z } from "zod";

/**
 * Which of a course's prices a visitor sees and pays, from the country the
 * request comes from: `domestic` (rupees) in India and wherever the country
 * is not known, `international` everywhere else. Only a course that has a
 * price for buyers outside India differs between the two.
 */
export const pricingRegionSchema = z.enum(["domestic", "international"]);
export type PricingRegion = z.infer<typeof pricingRegionSchema>;

/** `GET /checkout/pricing-region`: never cached, answered per request. */
export const pricingRegionResponseSchema = z.strictObject({
  region: pricingRegionSchema,
  /** ISO 3166-1 alpha-2, or null when the request does not say. */
  country: z.string().length(2).nullable(),
});
export type PricingRegionResponse = z.infer<typeof pricingRegionResponseSchema>;
