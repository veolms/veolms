import type { DatabaseExecutor } from "@veolms/database";
import type {
  AffiliateAttributionSource,
  AffiliateStatus,
} from "@veolms/contracts";

/**
 * Database access for the affiliate program's tracking tables: clicks,
 * referrals and order attributions, and the few affiliate fields tracking
 * reads. Usable with the normal executor or inside a transaction.
 */

export interface TrackedAffiliateRow {
  id: string;
  user_id: string | null;
  status: AffiliateStatus;
}

/** An approved affiliate by code (lower case), or undefined. */
export async function findApprovedAffiliateByCode(
  executor: DatabaseExecutor,
  code: string,
): Promise<TrackedAffiliateRow | undefined> {
  return await executor
    .selectFrom("affiliates")
    .select(["id", "user_id", "status"])
    .where("code", "=", code)
    .where("status", "=", "approved")
    .executeTakeFirst();
}

export async function insertClick(
  executor: DatabaseExecutor,
  click: {
    affiliateId: string;
    userId: string | null;
    landingPath: string;
    referrerHost: string | null;
    ipHash: string;
    userAgent: string;
    createdAt: Date;
    expiresAt: Date;
  },
): Promise<{ id: string }> {
  return await executor
    .insertInto("affiliate_clicks")
    .values({
      affiliate_id: click.affiliateId,
      user_id: click.userId,
      landing_path: click.landingPath,
      referrer_host: click.referrerHost,
      ip_hash: click.ipHash,
      user_agent: click.userAgent,
      created_at: click.createdAt,
      expires_at: click.expiresAt,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
}

export interface ClickWithAffiliateRow {
  click_id: string;
  created_at: Date;
  expires_at: Date;
  affiliate_id: string;
  affiliate_user_id: string | null;
  affiliate_status: AffiliateStatus;
}

/** A click and the affiliate it belongs to, or undefined. */
export async function findClickWithAffiliate(
  executor: DatabaseExecutor,
  clickId: string,
): Promise<ClickWithAffiliateRow | undefined> {
  return await executor
    .selectFrom("affiliate_clicks as c")
    .innerJoin("affiliates as a", "a.id", "c.affiliate_id")
    .select([
      "c.id as click_id",
      "c.created_at",
      "c.expires_at",
      "a.id as affiliate_id",
      "a.user_id as affiliate_user_id",
      "a.status as affiliate_status",
    ])
    .where("c.id", "=", clickId)
    .executeTakeFirst();
}

/** Ties a click to a buyer's account; the last click wins. */
export async function upsertReferral(
  executor: DatabaseExecutor,
  referral: {
    userId: string;
    affiliateId: string;
    clickId: string;
    expiresAt: Date;
    now: Date;
  },
): Promise<void> {
  await executor
    .insertInto("affiliate_referrals")
    .values({
      user_id: referral.userId,
      affiliate_id: referral.affiliateId,
      click_id: referral.clickId,
      expires_at: referral.expiresAt,
      updated_at: referral.now,
    })
    .onConflict((conflict) =>
      conflict.column("user_id").doUpdateSet({
        affiliate_id: referral.affiliateId,
        click_id: referral.clickId,
        expires_at: referral.expiresAt,
        updated_at: referral.now,
      }),
    )
    .execute();
}

/** Marks a click as made by a signed-in visitor (best effort). */
export async function setClickUser(
  executor: DatabaseExecutor,
  clickId: string,
  userId: string,
): Promise<void> {
  await executor
    .updateTable("affiliate_clicks")
    .set({ user_id: userId })
    .where("id", "=", clickId)
    .where("user_id", "is", null)
    .execute();
}

export interface ReferralWithAffiliateRow {
  click_id: string;
  expires_at: Date;
  affiliate_id: string;
  affiliate_user_id: string | null;
  affiliate_status: AffiliateStatus;
}

export async function findReferralWithAffiliate(
  executor: DatabaseExecutor,
  userId: string,
): Promise<ReferralWithAffiliateRow | undefined> {
  return await executor
    .selectFrom("affiliate_referrals as r")
    .innerJoin("affiliates as a", "a.id", "r.affiliate_id")
    .select([
      "r.click_id",
      "r.expires_at",
      "a.id as affiliate_id",
      "a.user_id as affiliate_user_id",
      "a.status as affiliate_status",
    ])
    .where("r.user_id", "=", userId)
    .executeTakeFirst();
}

/** The affiliate a personal coupon belongs to, or undefined. */
export async function findAffiliateByCouponId(
  executor: DatabaseExecutor,
  couponId: string,
): Promise<TrackedAffiliateRow | undefined> {
  return await executor
    .selectFrom("affiliates")
    .select(["id", "user_id", "status"])
    .where("coupon_id", "=", couponId)
    .executeTakeFirst();
}

/** Writes an order's credit once; a second write for the order changes nothing. */
export async function insertOrderAttribution(
  executor: DatabaseExecutor,
  attribution: {
    orderId: string;
    affiliateId: string;
    source: AffiliateAttributionSource;
    clickId: string | null;
    couponId: string | null;
    createdAt: Date;
  },
): Promise<void> {
  await executor
    .insertInto("affiliate_order_attributions")
    .values({
      order_id: attribution.orderId,
      affiliate_id: attribution.affiliateId,
      source: attribution.source,
      click_id: attribution.clickId,
      coupon_id: attribution.couponId,
      created_at: attribution.createdAt,
    })
    .onConflict((conflict) => conflict.column("order_id").doNothing())
    .execute();
}

/** The program-wide default rule, if the program has one. */
export async function findProgramDefaultRule(executor: DatabaseExecutor) {
  return await executor
    .selectFrom("affiliate_commission_rules")
    .select(["rate_type", "rate_value", "currency"])
    .where("affiliate_id", "is", null)
    .where("target_type", "is", null)
    .where("target_id", "is", null)
    .where("archived_at", "is", null)
    .executeTakeFirst();
}
