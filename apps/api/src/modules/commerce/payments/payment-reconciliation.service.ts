import crypto from "node:crypto";
import type { Database, Json } from "@veolms/database";
import type { Kysely } from "kysely";
import type { AccessService } from "../../access/access.service.ts";
import { createAccessService } from "../../access/access.service.ts";
import * as paymentRepo from "./payment.repository.ts";
import * as orderRepo from "../orders/order.repository.ts";
import { recordCouponRedemptionForPaidOrder } from "../coupons/coupon-redemption.service.ts";
import * as cartRepo from "../cart/cart.repository.ts";
import { createCourseAccessService } from "../shared/course-access.service.ts";
import { createOutboxService } from "../../../events/outbox.service.ts";
import { config } from "../../../config.ts";
import * as refundRepo from "../refunds/refund.repository.ts";
import { listHeldItemTitles } from "../shared/order-holdings.ts";
import {
  AUTO_REFUND_REASON,
  autoRefundKey,
  decideCapturedPayment,
  describeExtraCaptureForClosedOrder,
  describeExtraCaptureForHeldItems,
  isGatewayMoney,
} from "./extra-payment.ts";
import {
  SURPLUS_CAPTURE_ERROR_CODE,
  describeSurplusCapture,
  isOrderAlreadyPaid,
} from "./surplus-payment.ts";

export interface FinalizePaymentParams {
  /** Internal payment record id */
  paymentId: string;
  /** The gateway-issued payment identifier (e.g. Razorpay pay_xxx) */
  gatewayPaymentId: string;
  /** Structured payment method information from the gateway */
  paymentMethod?: Json | null;
  /**
   * Set when the caller already knows the gateway has refunded this
   * payment (it is recording the capture from a refund event): an extra
   * payment is then recorded without reserving an automatic refund.
   */
  skipAutoRefund?: boolean;
}

export interface FinalizePaymentResult {
  /**
   * "finalized"  — This caller won the race and completed all side-effects.
   * "already_captured" — Another path already captured this payment; nothing to do.
   * "recorded_as_surplus" — The gateway took this money for an order that had
   *   already been paid another way. The payment is recorded as captured and
   *   marked (see surplus-payment.ts); the order, its coupon and its access
   *   were not touched.
   * "recorded_as_extra" — The gateway took this money for an order that was
   *   not paid, when the buyer already had something the order sells, or
   *   for an order that had been closed and cannot be paid any more
   *   (cancelled, failed) (see extra-payment.ts). The payment is recorded
   *   and marked the same way, nothing was granted, and the order is closed
   *   unpaid.
   */
  outcome:
    | "finalized"
    | "already_captured"
    | "recorded_as_surplus"
    | "recorded_as_extra";
  orderId?: string;
  /** The order's buyer. Set with `orderId`. */
  userId?: string;
  enrollmentCount?: number;
  /**
   * An automatic refund of this payment was reserved. The caller sends it
   * (extra-payment-refund.service.ts) once this has returned; the scheduled
   * pass sends it if the caller cannot.
   */
  autoRefundReserved?: boolean;
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
  autoRefundExtraPayments = config.AUTO_REFUND_EXTRA_PAYMENTS,
}: {
  database: Kysely<Database>;
  accessService?: AccessService;
  /** See `AUTO_REFUND_EXTRA_PAYMENTS`. */
  autoRefundExtraPayments?: boolean;
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
    const autoRefund = autoRefundExtraPayments && !params.skipAutoRefund;

    const now = new Date();
    let enrolledCourseIds: string[] = [];
    let orderId: string | undefined;
    let userId: string | undefined;
    let recordedAsSurplus = false;
    let recordedAsExtra = false;
    let autoRefundReserved = false;

    await database.transaction().execute(async (trx) => {
      /**
       * Marks the claimed payment as extra money (surplus-payment.ts) and,
       * when it is to go back by itself, reserves its refund in this same
       * transaction: one row per payment, written by the one caller that
       * won the claim.
       */
      const recordExtraPayment = async (
        claimed: {
          id: string;
          order_id: string;
          amount: number;
          currency: string;
        },
        description: string,
        refund: boolean,
      ) => {
        await paymentRepo.transitionPaymentStatus(
          trx,
          claimed.id,
          "captured",
          ["captured"],
          {
            error_code: SURPLUS_CAPTURE_ERROR_CODE,
            error_description: description,
            updated_at: now,
          },
        );
        if (!refund) return;
        await refundRepo.insertRefund(trx, {
          id: crypto.randomUUID(),
          order_id: claimed.order_id,
          order_item_id: null,
          payment_id: claimed.id,
          gateway_refund_id: null,
          amount: claimed.amount,
          currency: claimed.currency,
          reason: AUTO_REFUND_REASON,
          status: "pending",
          created_by: null,
          idempotency_key: autoRefundKey(claimed.id),
          // No access is tied to this money, and none may be taken away
          // for it by any path that later completes this row.
          preserve_access: true,
          created_at: now,
          updated_at: now,
        });
        autoRefundReserved = true;
      };

      // ── Lock order: the order row first, then the payment row ───────────
      // Manual verification (manual-payment.service.ts) writes the order
      // and then closes its open gateway payment. This path used to claim
      // the payment and then write the order, so when both ran for one
      // order at the same moment each held the row the other needed and
      // Postgres ended one of them with 40P01 (deadlock detected). Taking
      // the order's row lock before anything else makes the two wait for
      // each other instead: whichever is second sees what the first did
      // (the order already paid) and takes its normal branch below. The
      // refund paths take the same lock first.
      //
      // Before the order row, the buyer's checkout lock, in the order every
      // checkout takes the two. Whether the buyer already has what this
      // order sells is decided below, and two payments of one buyer settling
      // at the same moment would otherwise each find the other's course not
      // granted yet.
      const target = await paymentRepo.findPaymentById(trx, paymentId);
      if (target) {
        const buyer = await orderRepo.findOrderById(trx, target.order_id);
        if (buyer) await orderRepo.lockBuyerCheckout(trx, buyer.user_id);
        await orderRepo.findOrderByIdForUpdate(trx, target.order_id);
      }

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
      userId = order.user_id;

      // 1. Record successful payment attempt
      const attemptCount = await paymentRepo.countPaymentAttempts(
        trx,
        paymentId,
      );
      await paymentRepo.insertPaymentAttempt(trx, {
        id: crypto.randomUUID(),
        payment_id: paymentId,
        gateway_payment_id: gatewayPaymentId,
        attempt_number: attemptCount + 1,
        status: "captured",
      });

      // 1b. Is this money for something the buyer already has? The order
      //     row and the buyer's checkout are locked, so what is read here
      //     still holds when this transaction ends. Asked only for an
      //     unpaid order paid through the gateway while automatic refunds
      //     are on (decideCapturedPayment); an order that is already paid
      //     takes the branch below as before.
      const heldTitles =
        autoRefund &&
        isGatewayMoney(claimed) &&
        !isOrderAlreadyPaid(order.status)
          ? await listHeldItemTitles(trx, order, now)
          : [];
      const decision = decideCapturedPayment({
        orderStatus: order.status,
        payment: claimed,
        heldTitles,
        autoRefund,
      });
      if (decision.kind === "extra" && decision.why === "already_held") {
        await recordExtraPayment(
          claimed,
          describeExtraCaptureForHeldItems(order.order_number, heldTitles),
          decision.refund,
        );
        // The order sold nothing new: it is closed unpaid, as the expiry
        // job would close it, and gives up its coupon.
        await orderRepo.expirePendingOrders(trx, [order.id], now);
        recordedAsExtra = true;
        return;
      }
      if (decision.kind === "extra" && decision.why === "order_closed") {
        // Money for an order that was closed without being paid and cannot
        // be paid any more (cancelled, failed). This used to throw: the
        // claim rolled back, the event was retried until it was
        // dead-lettered, and money the gateway had taken was on no list at
        // all. It is kept as an extra payment instead: nothing is granted,
        // the order stays as it is, and the money goes back by itself or
        // is listed for staff.
        await recordExtraPayment(
          claimed,
          describeExtraCaptureForClosedOrder(order.order_number, order.status),
          decision.refund,
        );
        recordedAsExtra = true;
        return;
      }

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
        // that's cancelled or already refunded.
        //
        // If the order was paid another way (staff verified a manual
        // transfer, and the buyer then completed the gateway payment too),
        // the gateway has this money and it will not change its mind.
        // Throwing here was retried until the event was dead-lettered and
        // left no record of the money at all. The claim and the captured
        // attempt above are kept and the payment is marked as surplus:
        // nothing below runs, so the order, its coupon and its access are
        // exactly as they were. Read again rather than trusting `order`,
        // which may predate the change that made the update miss.
        const settled = await orderRepo.findOrderById(trx, order.id);
        if (settled && isOrderAlreadyPaid(settled.status)) {
          await recordExtraPayment(
            claimed,
            describeSurplusCapture(order.order_number),
            autoRefund && isGatewayMoney(claimed),
          );
          recordedAsSurplus = true;
          return;
        }

        // Any other settled state (cancelled, failed) was decided above,
        // before the order was touched; the order row is locked, so it is
        // not expected here. If money was taken it is still never dropped:
        // it is kept as an extra payment, as above.
        if (claimed.amount > 0) {
          await recordExtraPayment(
            claimed,
            describeExtraCaptureForClosedOrder(
              order.order_number,
              settled?.status ?? order.status,
            ),
            autoRefund && isGatewayMoney(claimed),
          );
          recordedAsExtra = true;
          return;
        }

        // A no-cost payment for an order that cannot be paid: no money
        // exists to keep. Abort the whole transaction (the payment claim
        // rolls back too) rather than grant access for it.
        throw new Error(
          `finalizeSuccessfulPayment: order ${order.id} is not in a fulfillable ` +
            `status (was "${order.status}") — refusing to grant access for payment ${paymentId}`,
        );
      }

      // 3. Record coupon redemption — atomic global & per-user usage limit
      //    check + idempotent insert. The gateway has already captured this
      //    payment, so a limit reached here never blocks delivering what was
      //    paid for: the redemption is skipped and an event is published
      //    instead (see coupon-redemption.service.ts, shared with manual
      //    payment verification).
      await recordCouponRedemptionForPaidOrder(trx, {
        order,
        paymentId: claimed.id,
        now,
      });

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

    if (recordedAsSurplus || recordedAsExtra) {
      return {
        outcome: recordedAsSurplus
          ? "recorded_as_surplus"
          : "recorded_as_extra",
        orderId,
        userId,
        autoRefundReserved,
      };
    }

    return {
      outcome: "finalized",
      orderId,
      userId,
      enrollmentCount: enrolledCourseIds.length,
    };
  }

  return { finalizeSuccessfulPayment };
}
