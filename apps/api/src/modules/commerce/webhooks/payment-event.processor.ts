import crypto from "node:crypto";
import type { NormalizedPaymentEvent } from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";
import { createAccessService } from "../../access/access.service.ts";
import * as paymentRepo from "../payments/payment.repository.ts";
import * as orderRepo from "../orders/order.repository.ts";
import * as couponRepo from "../coupons/coupon.repository.ts";
import * as enrollmentRepo from "../enrollments/enrollment.repository.ts";
import * as bundleRepo from "../bundles/bundle.repository.ts";
import * as refundRepo from "../refunds/refund.repository.ts";
import * as webhookRepo from "./webhook.repository.ts";

export interface PaymentEventProcessor {
  processEvent(event: NormalizedPaymentEvent): Promise<void>;
}

export function createPaymentEventProcessor({
  database,
}: {
  database: Kysely<Database>;
}): PaymentEventProcessor {
  const accessService = createAccessService();

  /**
   * Idempotently processes normalized domain payment events in the background.
   */
  async function processEvent(event: NormalizedPaymentEvent): Promise<void> {
    try {
      if (event.eventType === "payment.succeeded") {
        await handlePaymentSucceeded(event);
      } else if (event.eventType === "payment.failed") {
        await handlePaymentFailed(event);
      } else if (event.eventType === "refund.succeeded") {
        await handleRefundSucceeded(event);
      }

      // Mark webhook as processed
      await webhookRepo.markWebhookEventProcessed(database, event.eventId);
    } catch (err: any) {
      await webhookRepo.markWebhookEventProcessed(
        database,
        event.eventId,
        err?.message || "Error processing event",
      );
      throw err;
    }
  }

  async function handlePaymentSucceeded(event: NormalizedPaymentEvent) {
    if (!event.gatewayOrderId) return;

    const payment = await paymentRepo.findPaymentByGatewayOrderId(database, event.gatewayOrderId);
    if (!payment) return;

    // Short-circuit if payment already captured
    if (payment.status === "captured") return;

    const order = await orderRepo.findOrderById(database, payment.order_id);
    if (!order) return;

    const now = new Date();
    const enrolledCourses: string[] = [];

    await database.transaction().execute(async (trx) => {
      // 1. Update Payment Record
      await paymentRepo.updatePayment(trx, payment.id, {
        gateway_payment_id: event.gatewayPaymentId,
        status: "captured",
        payment_method: event.paymentMethod ?? null,
        updated_at: now,
      });

      const existingAttempts = await paymentRepo.listPaymentAttempts(trx, payment.id);
      await paymentRepo.insertPaymentAttempt(trx, {
        id: crypto.randomUUID(),
        payment_id: payment.id,
        gateway_payment_id: event.gatewayPaymentId ?? null,
        attempt_number: existingAttempts.length + 1,
        status: "captured",
      });

      // 2. Mark Order as PAID
      await orderRepo.markOrderPaidIfPending(trx, order.id, now);

      // 3. Record Coupon Redemption (idempotent via ON CONFLICT DO NOTHING)
      if (order.coupon_id) {
        await couponRepo.insertCouponRedemption(trx, {
          id: crypto.randomUUID(),
          coupon_id: order.coupon_id,
          user_id: order.user_id,
          order_id: order.id,
          discount_amount: order.discount_amount,
          created_at: now,
        });
      }

      // 4. Grant Access + Enroll for every order item
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
          enrolledCourses.push(item.course_id);
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
            enrolledCourses.push(bc.course_id);
          }
        }
      }

      // 5. Record outbox event for durable post-purchase processing
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
            enrolledCourseIds: enrolledCourses,
          },
          processed_at: null,
          error: null,
          created_at: now,
        })
        .execute();
    });
  }

  async function handlePaymentFailed(event: NormalizedPaymentEvent) {
    if (!event.gatewayOrderId) return;

    const payment = await paymentRepo.findPaymentByGatewayOrderId(database, event.gatewayOrderId);
    if (!payment || payment.status === "captured") return;

    await paymentRepo.updatePayment(database, payment.id, {
      status: "failed",
      error_code: event.errorCode ?? "PAYMENT_FAILED",
      error_description: event.errorDescription ?? "Payment failed",
      updated_at: new Date(),
    });

    await paymentRepo.insertPaymentAttempt(database, {
      id: crypto.randomUUID(),
      payment_id: payment.id,
      gateway_payment_id: event.gatewayPaymentId ?? null,
      attempt_number: 1,
      status: "failed",
      error_code: event.errorCode ?? null,
      error_description: event.errorDescription ?? null,
    });
  }

  async function handleRefundSucceeded(event: NormalizedPaymentEvent) {
    if (!event.gatewayPaymentId) return;

    const payment = await paymentRepo.findPaymentByGatewayPaymentId(database, event.gatewayPaymentId);
    if (!payment) return;

    const order = await orderRepo.findOrderById(database, payment.order_id);
    if (!order) return;

    const refundAmount = event.amount ?? payment.amount;

    await refundRepo.insertRefund(database, {
      id: crypto.randomUUID(),
      order_id: payment.order_id,
      payment_id: payment.id,
      gateway_refund_id: event.gatewayRefundId ?? null,
      amount: refundAmount,
      currency: event.currency ?? payment.currency,
      status: "processed",
    });

    const isFullRefund = refundAmount >= payment.amount;
    await orderRepo.updateOrderStatus(database, payment.order_id, {
      status: isFullRefund ? "refunded" : "partially_refunded",
    });

    // Revoke access and suspend enrollments on full refund
    if (isFullRefund) {
      await accessService.revokeAccessForOrder(database, payment.order_id);

      const orderItems = await orderRepo.listOrderItems(database, payment.order_id);
      for (const item of orderItems) {
        const courseIds: string[] = [];
        if (item.item_type === "course" && item.course_id) {
          courseIds.push(item.course_id);
        } else if (item.item_type === "bundle" && item.bundle_id) {
          const bundleCourses = await bundleRepo.listBundleCourses(database, item.bundle_id);
          courseIds.push(...bundleCourses.map((bc) => bc.course_id));
        }
        for (const courseId of courseIds) {
          await enrollmentRepo.updateEnrollmentStatus(database, order.user_id, courseId, "revoked");
        }
      }
    }
  }

  return {
    processEvent,
  };
}
