import crypto from "node:crypto";
import type { Database, Json } from "@veolms/database";
import type { Kysely } from "kysely";
import type { AccessService } from "../../access/access.service.ts";
import { createAccessService } from "../../access/access.service.ts";
import * as paymentRepo from "./payment.repository.ts";
import * as orderRepo from "../orders/order.repository.ts";
import * as couponRepo from "../coupons/coupon.repository.ts";
import * as cartRepo from "../cart/cart.repository.ts";
import { createCourseAccessService } from "../shared/course-access.service.ts";
import { createOutboxService } from "../../../events/outbox.service.ts";

export interface FinalizePaymentParams {
  /** Internal payment record id */
  paymentId: string;
  /** The gateway-issued payment identifier (e.g. Razorpay pay_xxx) */
  gatewayPaymentId: string;
  /** Structured payment method information from the gateway */
  paymentMethod?: Json | null;
}

export interface FinalizePaymentResult {
  /**
   * "finalized"  — This caller won the race and completed all side-effects.
   * "already_captured" — Another path already captured this payment; nothing to do.
   */
  outcome: "finalized" | "already_captured";
  orderId?: string;
  enrollmentCount?: number;
}

export interface PaymentReconciliationService {
  /**
   * Idempotent, concurrency-safe finalization of a successful payment.
   *
   * Both /payments/verify and the Razorpay webhook worker call this function.
   * The atomic conditional UPDATE inside the transaction acts as the
   * single concurrency gate: only one concurrent caller transitions the
   * payment to "captured". The other caller receives `outcome: "already_captured"`
   * and returns immediately — making it impossible for any side-effect
   * (order paid, coupon redeemed, access granted, enrollment created) to
   * execute more than once.
   */
  finalizeSuccessfulPayment(
    params: FinalizePaymentParams,
  ): Promise<FinalizePaymentResult>;
}

export function createPaymentReconciliationService({
  database,
  accessService = createAccessService(),
}: {
  database: Kysely<Database>;
  accessService?: AccessService;
}): PaymentReconciliationService {
  const courseAccessService = createCourseAccessService({ accessService });
  const outbox = createOutboxService();
  /**
   * Idempotently captures a payment and fulfills the associated order.
   *
   * Concurrency rule:
   *   The `claimPaymentForFinalization` repository call performs a conditional
   *   UPDATE (`WHERE status NOT IN ('captured', 'refunded')`). PostgreSQL
   *   serializes concurrent updates to the same row, so exactly one transaction
   *   will see a non-NULL returned row. The transaction that gets `undefined`
   *   back knows the payment was already captured and exits early without
   *   touching any other table.
   */
  async function finalizeSuccessfulPayment(
    params: FinalizePaymentParams,
  ): Promise<FinalizePaymentResult> {
    const { paymentId, gatewayPaymentId, paymentMethod } = params;

    const now = new Date();
    let enrolledCourseIds: string[] = [];
    let orderId: string | undefined;

    await database.transaction().execute(async (trx) => {
      // ── Concurrency gate ────────────────────────────────────────────────
      // Atomically claim the payment. Only one concurrent caller wins.
      // The UPDATE is conditional on the payment not yet being captured,
      // so the second (or any later) concurrent caller gets undefined back
      // and we abort the transaction immediately without doing any work.
      const claimed = await paymentRepo.claimPaymentForFinalization(
        trx,
        paymentId,
        gatewayPaymentId,
        paymentMethod ?? null,
        now,
      );

      if (!claimed) {
        // Another concurrent path already captured this payment.
        // Returning normally commits an empty transaction (no rows changed);
        // rollback would require throwing an error if earlier writes needed to be undone.
        return;
      }

      // ── From here only one caller ever executes ──────────────────────────
      orderId = claimed.order_id;

      const order = await orderRepo.findOrderById(trx, claimed.order_id);
      if (!order) {
        // Should not happen in a consistent DB (payments.order_id is an FK
        // into orders), but a bare `return` here — unlike the identical-
        // looking `markedPaid` guard just below — would commit the payment
        // claim (already applied above via `trx`) as "captured" with zero
        // fulfillment: no coupon, no access, no enrollment, no cart
        // cleanup. The caller would still see `orderId` truthy and report
        // `outcome: "finalized"` as if everything succeeded. Throwing
        // aborts the whole transaction (the payment claim rolls back too),
        // so this surfaces as a failure to retry/investigate instead of a
        // silent charge-with-nothing-delivered.
        throw new Error(
          `finalizeSuccessfulPayment: claimed payment ${paymentId} references order ` +
            `${claimed.order_id}, which does not exist — refusing to commit the ` +
            `payment as captured with no fulfillment`,
        );
      }

      // 1. Record successful payment attempt
      const existingAttempts = await paymentRepo.listPaymentAttempts(
        trx,
        paymentId,
      );
      await paymentRepo.insertPaymentAttempt(trx, {
        id: crypto.randomUUID(),
        payment_id: paymentId,
        gateway_payment_id: gatewayPaymentId,
        attempt_number: existingAttempts.length + 1,
        status: "captured",
      });

      // 2. Mark order paid — idempotent conditional UPDATE
      //    (safe even if somehow called twice because WHERE filters non-paid statuses)
      const markedPaid = await orderRepo.markOrderPaidIfPending(
        trx,
        order.id,
        now,
      );
      if (!markedPaid) {
        // The payment claim gate above succeeded, but the order itself is in
        // a settled state (cancelled/paid/partially_refunded/refunded) that
        // markOrderPaidIfPending refuses to overwrite. Proceeding past this
        // point would grant access/enrollment for money attached to an order
        // that's cancelled or already refunded. Abort the whole transaction
        // — the payment claim rolls back too — so this gets caught and
        // retried/investigated instead of silently fulfilling.
        throw new Error(
          `finalizeSuccessfulPayment: order ${order.id} is not in a fulfillable ` +
            `status (was "${order.status}") — refusing to grant access for payment ${paymentId}`,
        );
      }

      // 3. Record coupon redemption — atomic global & per-user usage limit check + idempotent insert
      if (order.coupon_id) {
        const coupon = await trx
          .selectFrom("coupons")
          .select(["global_usage_limit", "per_user_limit"])
          .where("id", "=", order.coupon_id)
          .executeTakeFirst();

        await couponRepo.insertCouponRedemptionIfLimitNotReached(trx, {
          id: crypto.randomUUID(),
          coupon_id: order.coupon_id,
          user_id: order.user_id,
          order_id: order.id,
          discount_amount: order.discount_amount,
          global_usage_limit: coupon?.global_usage_limit ?? null,
          per_user_limit: coupon?.per_user_limit ?? null,
          created_at: now,
        });
      }

      // 4. Grant access + enroll for every order item (course + bundle-expanded).
      //    Both access_grants and enrollments use ON CONFLICT DO NOTHING,
      //    providing an additional safety layer on top of the payment gate.
      //    Single shared owner of this two-table write — see course-access.service.ts.
      const orderItems = await orderRepo.listOrderItems(trx, order.id);
      enrolledCourseIds = await courseAccessService.grantAccessForOrder(
        trx,
        order,
        orderItems,
        now,
      );

      // 5. Clean up purchased items from student's active cart
      await cartRepo.removeItemsFromUserCart(
        trx,
        order.user_id,
        orderItems.map((item) => ({
          course_id: item.course_id,
          bundle_id: item.bundle_id,
        })),
      );

      await outbox.publish(trx, {
        type: "payment.completed",
        version: 1,
        dedupeKey: `payment.completed:${claimed.id}`,
        occurredAt: now,
        payload: {
          paymentId: claimed.id,
          orderId: order.id,
          orderNumber: order.order_number,
          recipientUserId: order.user_id,
          totalAmount: order.total_amount,
          currency: order.currency,
          itemTitles: orderItems.map((item) => item.title_snapshot),
        },
      });
    });

    // If orderId was never set, the claim returned undefined → already captured
    if (!orderId) {
      return { outcome: "already_captured" };
    }

    return {
      outcome: "finalized",
      orderId,
      enrollmentCount: enrolledCourseIds.length,
    };
  }

  return { finalizeSuccessfulPayment };
}
