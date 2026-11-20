import crypto from "node:crypto";

import {
  AFFILIATE_CODE_PATTERN,
  type AffiliateAttributionSource,
  type AffiliateStatus,
} from "@veolms/contracts";

/**
 * The rules of referral tracking (PRD sections 9.2 and 11), without the
 * database: which visits count, and who gets credit for an order.
 */

/** A repeat visit by the same visitor for the same affiliate within this is not counted. */
export const CLICK_DEDUPE_MS = 30 * 60 * 1000;

/** Raw clicks are kept this long, then purged (section 11.8). */
export const CLICK_RETENTION_MONTHS = 13;

const BOT_PATTERN =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|embedly|curl|wget|python-requests|httpclient|headless|lighthouse|pingdom|monitor/iu;

/** Crawlers, link previews and scripts do not make clicks. */
export function isBotUserAgent(userAgent: string | undefined | null): boolean {
  if (!userAgent || userAgent.trim() === "") return true;
  return BOT_PATTERN.test(userAgent);
}

/**
 * The code as the visitor's link carried it, ready to look up, or null when
 * it cannot be anyone's code (checked before any database work).
 */
export function normalizeAffiliateCode(code: string): string | null {
  const trimmed = code.trim();
  return AFFILIATE_CODE_PATTERN.test(trimmed) ? trimmed.toLowerCase() : null;
}

/** A same-site path to store, never a full address or anything off-site. */
export function normalizeLandingPath(path: string | undefined | null): string {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return "/";
  const withoutQuery = path.split(/[?#]/u)[0] ?? "/";
  return withoutQuery.slice(0, 500) || "/";
}

/** Only the host of the page that sent the visitor is kept. */
export function referrerHost(
  referrer: string | undefined | null,
): string | null {
  if (!referrer) return null;
  try {
    const url = new URL(referrer);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.hostname.slice(0, 255) || null;
  } catch {
    return null;
  }
}

/** A user agent short enough to store. */
export function shortUserAgent(userAgent: string | undefined | null): string {
  return (userAgent ?? "").slice(0, 255);
}

/**
 * A keyed hash of the visitor's address: never the address itself. The key
 * is derived from the server secret for this one purpose.
 */
export function hashAddress(address: string, serverSecret: string): string {
  const key = crypto
    .createHmac("sha256", serverSecret)
    .update("veolms:affiliate-address-hash:v1")
    .digest();
  return crypto.createHmac("sha256", key).update(address).digest("hex");
}

/** An affiliate as attribution needs to know them. */
export interface AttributionAffiliate {
  id: string;
  userId: string | null;
  status: AffiliateStatus;
}

/** One way an order might be credited: a code, a link click, or the account's last click. */
export interface AttributionCandidate {
  affiliate: AttributionAffiliate;
  clickId: string | null;
  couponId: string | null;
  /** When a click stops counting; null for a code (a code has no window). */
  expiresAt: Date | null;
}

export interface AttributionDecision {
  affiliateId: string;
  source: AffiliateAttributionSource;
  clickId: string | null;
  couponId: string | null;
}

/**
 * Who gets credit for an order, decided once when it is made:
 *
 * 1. the affiliate whose code (their personal coupon) is on the order;
 * 2. else the click in the buyer's cookie, while it is inside its window;
 * 3. else the click tied to the buyer's account, inside its window;
 * 4. else nobody.
 *
 * The one chosen must be approved and must not be the buyer; otherwise
 * nobody gets credit (there is no falling back to the next candidate, so an
 * affiliate's own click can never pass the credit to someone else's older
 * one). Credit is never split.
 */
export function decideAttribution(input: {
  buyerUserId: string;
  now: Date;
  code: AttributionCandidate | null;
  link: AttributionCandidate | null;
  account: AttributionCandidate | null;
}): AttributionDecision | null {
  const live = (candidate: AttributionCandidate | null) =>
    candidate &&
    (candidate.expiresAt === null ||
      candidate.expiresAt.getTime() > input.now.getTime())
      ? candidate
      : null;
  const ordered: [AttributionCandidate | null, AffiliateAttributionSource][] = [
    [input.code, "code"],
    [live(input.link), "link"],
    [live(input.account), "account"],
  ];
  const chosen = ordered.find(([candidate]) => candidate !== null);
  if (!chosen) return null;
  const [candidate, source] = chosen as [
    AttributionCandidate,
    AffiliateAttributionSource,
  ];
  if (candidate.affiliate.status !== "approved") return null;
  if (candidate.affiliate.userId === input.buyerUserId) return null;
  return {
    affiliateId: candidate.affiliate.id,
    source,
    clickId: candidate.clickId,
    couponId: candidate.couponId,
  };
}
