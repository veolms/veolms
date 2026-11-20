import crypto from "node:crypto";

import type { DatabaseExecutor } from "@veolms/database";

import * as couponRepo from "./coupon.repository.ts";

/**
 * Affiliates' personal coupons (PRD FR-12): when the program gives buyers a
 * discount, each approved affiliate's code also works as an ordinary coupon
 * for that much off. Commerce owns coupons, so the affiliate module makes
 * and changes them through these functions. They follow every rule of an
 * ordinary coupon at checkout.
 */

const TEN_YEARS_MS = 10 * 365 * 24 * 60 * 60 * 1000;

/** Whether a coupon already uses this code (codes are shared with affiliates). */
export async function couponCodeExists(
  executor: DatabaseExecutor,
  code: string,
): Promise<boolean> {
  return (
    (await couponRepo.findCouponByCode(executor, code.toUpperCase())) !==
    undefined
  );
}

/** Makes an affiliate's personal coupon; returns its id. */
export async function createAffiliateCoupon(
  executor: DatabaseExecutor,
  input: { code: string; percentOff: number; createdBy: string | null },
): Promise<string> {
  const now = new Date();
  const coupon = await couponRepo.insertCoupon(executor, {
    id: crypto.randomUUID(),
    code: input.code.toUpperCase(),
    description: "Affiliate code",
    discount_type: "percentage",
    discount_value: input.percentOff,
    min_order_amount: 0,
    starts_at: now,
    expires_at: new Date(now.getTime() + TEN_YEARS_MS),
    global_usage_limit: null,
    // Once per buyer, as an introduction should be.
    per_user_limit: 1,
    is_active: true,
    created_by: input.createdBy,
    created_at: now,
    updated_at: now,
  });
  return coupon.id;
}

/** Switches a personal coupon on or off, or changes its discount. */
export async function updateAffiliateCoupon(
  executor: DatabaseExecutor,
  couponId: string,
  changes: { active?: boolean; percentOff?: number },
): Promise<void> {
  await couponRepo.updateCoupon(executor, couponId, {
    ...(changes.active === undefined ? {} : { is_active: changes.active }),
    ...(changes.percentOff === undefined
      ? {}
      : { discount_value: changes.percentOff }),
    updated_at: new Date(),
  });
}
