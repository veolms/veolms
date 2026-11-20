import type {
  PublicAffiliateProgramResponse,
  RecordAffiliateClickRequest,
} from "@veolms/contracts";
import type { Database, DatabaseExecutor } from "@veolms/database";
import type { Kysely } from "kysely";

import type { PlatformSettingsService } from "../platform/index.ts";
import {
  CLICK_DEDUPE_MS,
  decideAttribution,
  hashAddress,
  isBotUserAgent,
  normalizeAffiliateCode,
  normalizeLandingPath,
  referrerHost,
  shortUserAgent,
  type AttributionCandidate,
  type AttributionDecision,
} from "./affiliate-tracking.ts";
import * as repository from "./affiliates.repository.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RecordClickInput extends RecordAffiliateClickRequest {
  /** The visitor's address; only a keyed hash of it is stored. */
  address: string;
  userAgent: string | undefined;
  /** The signed-in visitor, if any. */
  userId: string | null;
  /** The click already in the visitor's (verified) cookie, if any. */
  existingClickId: string | null;
}

export interface RecordedClick {
  clickId: string;
  /** How long the cookie should live: the program's attribution window. */
  maxAgeSeconds: number;
}

export interface AffiliateTrackingService {
  /** The join page's facts. */
  getPublicProgram(): Promise<PublicAffiliateProgramResponse>;
  /**
   * Records a visit through an affiliate's link. Null when nothing was
   * recorded: the program is off, the code is no approved affiliate's, the
   * visitor is a bot, or it repeats the same affiliate's click within 30
   * minutes. The caller answers the same either way.
   */
  recordClick(input: RecordClickInput): Promise<RecordedClick | null>;
  /** Ties the cookie's click to the account that just signed in. */
  claimReferral(input: {
    userId: string;
    clickId: string | null;
  }): Promise<void>;
  /**
   * Decides and stores who gets credit for an order. Runs inside the
   * order's transaction; the caller isolates it so that a failure here
   * never fails the order.
   */
  resolveOrderAttribution(
    executor: DatabaseExecutor,
    input: {
      orderId: string;
      buyerUserId: string;
      couponId: string | null;
      clickId: string | null;
      now: Date;
    },
  ): Promise<AttributionDecision | null>;
}

export function createAffiliateTrackingService({
  database,
  platformSettings,
  serverSecret,
}: {
  database: Kysely<Database>;
  platformSettings: Pick<
    PlatformSettingsService,
    "getAffiliateProgramSettings"
  >;
  /** Keys the address hash (the server's session secret). */
  serverSecret: string;
}): AffiliateTrackingService {
  async function getPublicProgram(): Promise<PublicAffiliateProgramResponse> {
    const settings = await platformSettings.getAffiliateProgramSettings();
    const rule = settings.enabled
      ? await repository.findProgramDefaultRule(database)
      : undefined;
    return {
      enabled: settings.enabled,
      joinMode: settings.joinMode,
      attributionWindowDays: settings.attributionWindowDays,
      holdDays: settings.holdDays,
      minPayoutMinor: settings.minPayoutMinor,
      buyerDiscountPercent: settings.buyerDiscountPercent,
      termsText: settings.termsText,
      defaultRate: rule
        ? {
            rateType: rule.rate_type,
            rateValue: rule.rate_value,
            currency: rule.currency,
          }
        : null,
    };
  }

  async function recordClick(
    input: RecordClickInput,
  ): Promise<RecordedClick | null> {
    const code = normalizeAffiliateCode(input.code);
    if (!code || isBotUserAgent(input.userAgent)) return null;
    const settings = await platformSettings.getAffiliateProgramSettings();
    if (!settings.enabled) return null;
    const affiliate = await repository.findApprovedAffiliateByCode(
      database,
      code,
    );
    if (!affiliate) return null;

    const now = new Date();
    if (input.existingClickId) {
      const existing = await repository.findClickWithAffiliate(
        database,
        input.existingClickId,
      );
      if (
        existing &&
        existing.affiliate_id === affiliate.id &&
        now.getTime() - existing.created_at.getTime() < CLICK_DEDUPE_MS
      ) {
        return null;
      }
    }

    const expiresAt = new Date(
      now.getTime() + settings.attributionWindowDays * DAY_MS,
    );
    const click = await repository.insertClick(database, {
      affiliateId: affiliate.id,
      userId: input.userId,
      landingPath: normalizeLandingPath(input.landingPath),
      referrerHost: referrerHost(input.referrer),
      ipHash: hashAddress(input.address, serverSecret),
      userAgent: shortUserAgent(input.userAgent),
      createdAt: now,
      expiresAt,
    });
    // A signed-in visitor's click is tied to their account at once; the
    // affiliate's own visits never are.
    if (input.userId && input.userId !== affiliate.user_id) {
      await repository.upsertReferral(database, {
        userId: input.userId,
        affiliateId: affiliate.id,
        clickId: click.id,
        expiresAt,
        now,
      });
    }
    return {
      clickId: click.id,
      maxAgeSeconds: settings.attributionWindowDays * 24 * 60 * 60,
    };
  }

  async function claimReferral({
    userId,
    clickId,
  }: {
    userId: string;
    clickId: string | null;
  }): Promise<void> {
    if (!clickId) return;
    const click = await repository.findClickWithAffiliate(database, clickId);
    const now = new Date();
    if (
      !click ||
      click.expires_at.getTime() <= now.getTime() ||
      click.affiliate_status !== "approved" ||
      click.affiliate_user_id === userId
    ) {
      return;
    }
    await repository.upsertReferral(database, {
      userId,
      affiliateId: click.affiliate_id,
      clickId: click.click_id,
      expiresAt: click.expires_at,
      now,
    });
    await repository.setClickUser(database, click.click_id, userId);
  }

  async function resolveOrderAttribution(
    executor: DatabaseExecutor,
    input: {
      orderId: string;
      buyerUserId: string;
      couponId: string | null;
      clickId: string | null;
      now: Date;
    },
  ): Promise<AttributionDecision | null> {
    const settings = await platformSettings.getAffiliateProgramSettings();
    if (!settings.enabled) return null;

    const [byCoupon, click, referral] = await Promise.all([
      input.couponId
        ? repository.findAffiliateByCouponId(executor, input.couponId)
        : undefined,
      input.clickId
        ? repository.findClickWithAffiliate(executor, input.clickId)
        : undefined,
      repository.findReferralWithAffiliate(executor, input.buyerUserId),
    ]);
    const code: AttributionCandidate | null = byCoupon
      ? {
          affiliate: {
            id: byCoupon.id,
            userId: byCoupon.user_id,
            status: byCoupon.status,
          },
          clickId: null,
          couponId: input.couponId,
          expiresAt: null,
        }
      : null;
    const link: AttributionCandidate | null = click
      ? {
          affiliate: {
            id: click.affiliate_id,
            userId: click.affiliate_user_id,
            status: click.affiliate_status,
          },
          clickId: click.click_id,
          couponId: null,
          expiresAt: click.expires_at,
        }
      : null;
    const account: AttributionCandidate | null = referral
      ? {
          affiliate: {
            id: referral.affiliate_id,
            userId: referral.affiliate_user_id,
            status: referral.affiliate_status,
          },
          clickId: referral.click_id,
          couponId: null,
          expiresAt: referral.expires_at,
        }
      : null;

    const decision = decideAttribution({
      buyerUserId: input.buyerUserId,
      now: input.now,
      code,
      link,
      account,
    });
    if (!decision) return null;
    await repository.insertOrderAttribution(executor, {
      orderId: input.orderId,
      affiliateId: decision.affiliateId,
      source: decision.source,
      clickId: decision.clickId,
      couponId: decision.couponId,
      createdAt: input.now,
    });
    return decision;
  }

  return {
    getPublicProgram,
    recordClick,
    claimReferral,
    resolveOrderAttribution,
  };
}

/**
 * Whether a coupon is the buyer's own affiliate code: an affiliate may not
 * buy with their own code (it would earn them the discount and the
 * commission on their own purchase).
 */
export async function isOwnAffiliateCoupon(
  executor: DatabaseExecutor,
  couponId: string,
  userId: string,
): Promise<boolean> {
  const affiliate = await repository.findAffiliateByCouponId(
    executor,
    couponId,
  );
  return affiliate?.user_id === userId;
}
