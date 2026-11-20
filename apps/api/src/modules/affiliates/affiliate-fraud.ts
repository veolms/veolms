import type { AffiliateCommissionFlag } from "@veolms/contracts";

/**
 * The basic fraud checks of the PRD (FR-13). The obvious case (the buyer is
 * the affiliate) is blocked when credit is decided; these only flag a
 * commission so that it waits for a person. A flag never rejects on its own:
 * shared hostel and office networks cause false matches.
 */

/** Sign-ins within a day either side of a click count for an address match. */
export const IP_MATCH_WINDOW_MS = 24 * 60 * 60 * 1000;

/** An affiliate whose recent sales are refunded more often than this is held. */
export const HIGH_REFUND_RATE = 0.3;
/** How many of the affiliate's latest sales the rate is taken over. */
export const REFUND_RATE_SALES = 10;
/** Fewer sales than this are too few to judge. */
export const REFUND_RATE_MIN_SALES = 3;

/**
 * An email as it would reach the same inbox: lower case, without dots or a
 * +tag in the part before the @.
 */
export function normalizeEmailForMatch(
  email: string | null | undefined,
): string | null {
  if (!email) return null;
  const [local, domain] = email.trim().toLowerCase().split("@");
  if (!local || !domain) return null;
  const withoutTag = local.split("+")[0] ?? local;
  return `${withoutTag.replaceAll(".", "")}@${domain}`;
}

/** A phone number by its last ten digits (country code and spacing ignored). */
export function normalizePhoneForMatch(
  phone: string | null | undefined,
): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/gu, "");
  return digits.length >= 6 ? digits.slice(-10) : null;
}

export interface SaleFraudInput {
  buyer: { email: string | null; phone: string | null };
  affiliate: {
    email: string | null;
    phone: string | null;
    /** Suspended since the order was made. */
    suspended: boolean;
  };
  /** The click that earned the credit, if a click did. */
  clickIpHash: string | null;
  /** Keyed hashes of the addresses the affiliate signed in from around the click. */
  affiliateSignInHashes: readonly string[];
}

/** The flags a new sale commission is written with. */
export function saleFraudFlags(
  input: SaleFraudInput,
): AffiliateCommissionFlag[] {
  const flags: AffiliateCommissionFlag[] = [];
  const buyerEmail = normalizeEmailForMatch(input.buyer.email);
  if (
    buyerEmail &&
    buyerEmail === normalizeEmailForMatch(input.affiliate.email)
  ) {
    flags.push("email_match");
  }
  const buyerPhone = normalizePhoneForMatch(input.buyer.phone);
  if (
    buyerPhone &&
    buyerPhone === normalizePhoneForMatch(input.affiliate.phone)
  ) {
    flags.push("phone_match");
  }
  if (
    input.clickIpHash &&
    input.affiliateSignInHashes.includes(input.clickIpHash)
  ) {
    flags.push("ip_match");
  }
  if (input.affiliate.suspended) flags.push("affiliate_suspended");
  return flags;
}

/**
 * Whether an affiliate's latest sales are refunded too often: more than 30%
 * of their last ten (at least three to judge).
 */
export function hasHighRefundRate(
  latestSales: readonly { refunded: boolean }[],
): boolean {
  const considered = latestSales.slice(0, REFUND_RATE_SALES);
  if (considered.length < REFUND_RATE_MIN_SALES) return false;
  const refunded = considered.filter((sale) => sale.refunded).length;
  return refunded / considered.length > HIGH_REFUND_RATE;
}
