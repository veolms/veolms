import type { PricingRegion } from "@veolms/contracts";
import { config } from "../../../config.ts";

/**
 * Which of a course's prices a buyer from `country` sees and pays: the
 * rupee price in DOMESTIC_PRICING_COUNTRIES (India by default) and wherever
 * the country is not known (no header, Cloudflare's XX and T1), the price for
 * buyers outside India everywhere else.
 */
export function pricingRegionForCountry(
  country: string | null | undefined,
  domesticCountries: readonly string[] = config.DOMESTIC_PRICING_COUNTRIES,
): PricingRegion {
  if (!country || country === "XX" || country === "T1") return "domestic";
  return domesticCountries.includes(country) ? "domestic" : "international";
}
