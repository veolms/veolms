import crypto from "node:crypto";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";
import type { AccessService } from "../../access/access.service.ts";
import { createAccessService } from "../../access/access.service.ts";
import * as paymentRepo from "./payment.repository.ts";
import * as orderRepo from "../orders/order.repository.ts";
import * as couponRepo from "../coupons/coupon.repository.ts";
import * as enrollmentRepo from "../enrollments/enrollment.repository.ts";
import * as bundleRepo from "../bundles/bundle.repository.ts";
import * as cartRepo from "../cart/cart.repository.ts";

export interface FinalizePaymentParams {
  /** Internal payment record id */
  paymentId: string;
  /** The gateway-issued payment identifier (e.g. Razorpay pay_xxx) */
  gatewayPaymentId: string;
  /** Structured payment method information from the gateway */
  paymentMethod?: unknown | null;
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
  finalizeSuccessfulPayment(params: FinalizePaymentParams): Promise<FinalizePaymentResult>;
}

export function createPaymentReconciliationService({
  database,
  accessService = createAccessService(),
}: {
  database: Kysely<Database>;
  accessService?: AccessService;
}): PaymentReconciliationService {
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
        // Roll back (nothing was changed) and signal the caller.
        return; // transaction body returns — Kysely rolls back an empty transaction cleanly
      }

      // ── From here only one caller ever executes ──────────────────────────
      orderId = claimed.order_id;

      const order = await orderRepo.findOrderById(trx, claimed.order_id);
      if (!order) return; // defensive; should not happen in a consistent DB

      // 1. Record successful payment attempt
      const existingAttempts = await paymentRepo.listPaymentAttempts(trx, paymentId);
      await paymentRepo.insertPaymentAttempt(trx, {
        id: crypto.randomUUID(),
        payment_id: paymentId,
        gateway_payment_id: gatewayPaymentId,
        attempt_number: existingAttempts.length + 1,
        status: "captured",
      });

      // 2. Mark order paid — idempotent conditional UPDATE
      //    (safe even if somehow called twice because WHERE filters non-paid statuses)
      const markedPaid = await orderRepo.markOrderPaidIfPending(trx, order.id, now);
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

      // 4. Grant access + enroll for every order item
      //    Both access_grants and enrollments use ON CONFLICT DO NOTHING,
      //    providing an additional safety layer on top of the payment gate.
      const orderItems = await orderRepo.listOrderItems(trx, order.id);

      for (const item of orderItems) {
        if (item.item_type === "course" && item.course_id) {
          await accessService.grantAccess(trx, {
            userId: order.user_id,
            courseId: item.course_id,
            orderId: order.id,
            source: "purchase",
            validFrom: now,
          });
          await enrollmentRepo.insertEnrollment(trx, {
            id: crypto.randomUUID(),
            user_id: order.user_id,
            course_id: item.course_id,
            order_id: order.id,
            status: "active",
            source: "direct_purchase",
            access_starts_at: now,
            access_expires_at: null,
            created_at: now,
            updated_at: now,
          });
          enrolledCourseIds.push(item.course_id);
        } else if (item.item_type === "bundle" && item.bundle_id) {
          const bundleCourses = await bundleRepo.listBundleCourses(trx, item.bundle_id);
          for (const bc of bundleCourses) {
            await accessService.grantAccess(trx, {
              userId: order.user_id,
              courseId: bc.course_id,
              orderId: order.id,
              source: "bundle_purchase",
              validFrom: now,
            });
            await enrollmentRepo.insertEnrollment(trx, {
              id: crypto.randomUUID(),
              user_id: order.user_id,
              course_id: bc.course_id,
              order_id: order.id,
              status: "active",
              source: "bundle_purchase",
              access_starts_at: now,
              access_expires_at: null,
              created_at: now,
              updated_at: now,
            });
            enrolledCourseIds.push(bc.course_id);
          }
        }
      }

      // 5. Clean up purchased items from student's active cart
      await cartRepo.removeItemsFromUserCart(
        trx,
        order.user_id,
        orderItems.map((item) => ({
          course_id: item.course_id,
          bundle_id: item.bundle_id,
        })),
      );

      // 6. Record outbox event for durable post-purchase processing
      await trx
        .insertInto("outbox_events")
        .values({
          id: crypto.randomUUID(),
          event_name: "purchase.completed",
          aggregate_type: "purchase",
          aggregate_id: order.id,
          payload: {
            orderId: order.id,
            orderNumber: order.order_number,
            userId: order.user_id,
            totalAmount: order.total_amount,
            enrolledCourseIds,
          },
          processed_at: null,
          error: null,
          created_at: now,
        })
        .execute();
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
