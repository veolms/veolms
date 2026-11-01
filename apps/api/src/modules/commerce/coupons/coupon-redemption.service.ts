import crypto from "node:crypto";
import type { Database } from "@veolms/database";
import type { Transaction } from "kysely";
import { createOutboxService } from "../../../events/outbox.service.ts";
import * as couponRepo from "./coupon.repository.ts";

/**
 * Records the coupon use of an order that has just been paid, inside the
 * caller's transaction. Every way an order becomes paid goes through here
 * (gateway capture, manual verification), so a coupon's limits count them
 * all: an order paid by hand used to leave no redemption, and the coupon
 * could be used again.
 *
 * The buyer has already paid by the time this runs, so reaching a limit
 * here does not undo the order. The redemption is skipped and an event is
 * published for whoever looks after coupons. The limits themselves are
 * enforced earlier, when the order is created.
 */
export async function recordCouponRedemptionForPaidOrder(
  transaction: Transaction<Database>,
  input: {
    order: {
      id: string;
      user_id: string;
      coupon_id: string | null;
      discount_amount: number;
    };
    paymentId: string;
    now: Date;
  },
): Promise<void> {
  const { order, paymentId, now } = input;
  if (!order.coupon_id) return;

  const coupon = await couponRepo.findCouponById(transaction, order.coupon_id);

  const redemptionResult =
    await couponRepo.insertCouponRedemptionIfLimitNotReached(transaction, {
      id: crypto.randomUUID(),
      coupon_id: order.coupon_id,
      user_id: order.user_id,
      order_id: order.id,
      discount_amount: order.discount_amount,
      global_usage_limit: coupon?.global_usage_limit ?? null,
      per_user_limit: coupon?.per_user_limit ?? null,
      created_at: now,
    });

  if (redemptionResult.success) return;

  await createOutboxService().publish(transaction, {
    type: "coupon.redemption_limit_exceeded_at_finalization",
    version: 1,
    dedupeKey: `coupon.redemption_limit_exceeded:${paymentId}`,
    occurredAt: now,
    payload: {
      paymentId,
      orderId: order.id,
      couponId: order.coupon_id,
      couponCode: coupon?.code ?? order.coupon_id,
      reason: redemptionResult.reason,
    },
  });
}
