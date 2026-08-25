import crypto from "node:crypto";
import type { NormalizedPaymentEvent } from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";
import type { FastifyBaseLogger } from "fastify";
import type { EmailService } from "../../../services/email/index.ts";
import * as paymentRepo from "../payments/payment.repository.ts";
import * as orderRepo from "../orders/order.repository.ts";
import * as couponRepo from "../coupons/coupon.repository.ts";
import * as enrollmentRepo from "../enrollments/enrollment.repository.ts";
import * as bundleRepo from "../bundles/bundle.repository.ts";
import * as refundRepo from "../refunds/refund.repository.ts";
import * as authRepo from "../../auth/authentication/authentication.repository.ts";
import * as webhookRepo from "../webhooks/webhook.repository.ts";

export interface PaymentWorkerOptions {
  database: Kysely<Database>;
  emailService?: EmailService;
  logger?: FastifyBaseLogger;
}

export interface PaymentWorker {
  processPaymentJob(event: NormalizedPaymentEvent): Promise<{
    status: "processed" | "skipped" | "failed";
    orderId?: string;
    enrollmentCount?: number;
    error?: string;
  }>;
}

/**
 * Robust, idempotent background worker for processing payment confirmations,
 * expanding course bundles, creating student enrollments, and queueing confirmation emails.
 */
export function createPaymentWorker({
  database,
  emailService,
  logger,
}: PaymentWorkerOptions): PaymentWorker {
  async function processPaymentJob(event: NormalizedPaymentEvent) {
    const log = logger?.child({
      job: "payment-worker",
      eventId: event.eventId,
      eventType: event.eventType,
    });

    log?.info(`Processing payment job for event: ${event.eventType}`);

    try {
      if (event.eventType === "payment.succeeded") {
        return await handlePaymentSucceeded(event, log);
      } else if (event.eventType === "payment.failed") {
        return await handlePaymentFailed(event, log);
      } else if (event.eventType === "refund.succeeded") {
        return await handleRefundSucceeded(event, log);
      }

      await webhookRepo.markWebhookEventProcessed(database, event.eventId);
      return { status: "processed" as const };
    } catch (err: any) {
      log?.error({ err }, `Payment worker job execution failed`);
      await webhookRepo.markWebhookEventProcessed(
        database,
        event.eventId,
        err?.message || "Worker error",
      );
      throw err;
    }
  }

  async function handlePaymentSucceeded(
    event: NormalizedPaymentEvent,
    log?: FastifyBaseLogger,
  ) {
    if (!event.gatewayOrderId) {
      log?.warn("Event missing gatewayOrderId, skipping");
      return { status: "skipped" as const };
    }

    const payment = await paymentRepo.findPaymentByGatewayOrderId(database, event.gatewayOrderId);
    if (!payment) {
      log?.warn(`No payment record found for gatewayOrderId: ${event.gatewayOrderId}`);
      return { status: "skipped" as const };
    }

    const order = await orderRepo.findOrderById(database, payment.order_id);
    if (!order) {
      log?.warn(`No order record found for orderId: ${payment.order_id}`);
      return { status: "skipped" as const };
    }

    const now = new Date();

    // 1. Transactional State Transition & Snapshot Enrollment
    const enrollmentResults = await database.transaction().execute(async (trx) => {
      // Mark Payment Captured & Record Attempt
      await paymentRepo.updatePayment(trx, payment.id, {
        gateway_payment_id: event.gatewayPaymentId,
        status: "captured",
        payment_method: event.paymentMethod ?? null,
        updated_at: now,
      });

      await paymentRepo.insertPaymentAttempt(trx, {
        id: crypto.randomUUID(),
        payment_id: payment.id,
        gateway_payment_id: event.gatewayPaymentId ?? null,
        attempt_number: 1,
        status: "captured",
      });

      // Optimistically Mark Order PAID
      await orderRepo.markOrderPaidIfPending(trx, order.id, now);

      // Record Coupon Redemption if applied
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

      // Resolve Order Items & Expand Bundles
      const orderItems = await orderRepo.listOrderItems(trx, order.id);
      const enrolledCourses: string[] = [];

      for (const item of orderItems) {
        if (item.item_type === "course" && item.course_id) {
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

      return enrolledCourses;
    });

    // 2. Mark Webhook Processed
    await webhookRepo.markWebhookEventProcessed(database, event.eventId);

    // 3. Post-Purchase Side Effects (Non-blocking: failures must never fail payment or enrollment)
    try {
      const orderItems = await orderRepo.listOrderItems(database, order.id);
      const user = await authRepo.findUserById(database, order.user_id);

      const itemsSummary = orderItems
        .map((it) => `- ${it.title_snapshot} (₹${(it.final_amount / 100).toFixed(2)})`)
        .join("\n");
      const itemsHtmlList = orderItems
        .map(
          (it) =>
            `<li><strong>${it.title_snapshot}</strong>: ₹${(it.final_amount / 100).toFixed(2)}</li>`,
        )
        .join("");

      const subtotalFormatted = `₹${(order.subtotal_amount / 100).toFixed(2)}`;
      const discountFormatted = `₹${(order.discount_amount / 100).toFixed(2)}`;
      const totalFormatted = `₹${(order.total_amount / 100).toFixed(2)}`;
      const paymentRef = event.gatewayPaymentId ?? payment.gateway_payment_id ?? "N/A";

      // 3A. Generate Invoice / Purchase Confirmation Event
      log?.info(
        {
          orderNumber: order.order_number,
          userId: order.user_id,
          totalAmount: order.total_amount,
          discountAmount: order.discount_amount,
          paymentReference: paymentRef,
          itemCount: orderItems.length,
        },
        "Post-purchase invoice event recorded",
      );

      // 3B. Queue Confirmation Email
      if (emailService && user?.email) {
        await emailService.send(user.email, {
          subject: `Order Confirmation & Receipt - ${order.order_number}`,
          text: `Hi ${user.display_name},\n\nThank you for your purchase!\n\nOrder Number: ${order.order_number}\nPayment Reference: ${paymentRef}\nSubtotal: ${subtotalFormatted}\nDiscount: ${discountFormatted}\nTotal Paid: ${totalFormatted}\n\nPurchased Courses:\n${itemsSummary}\n\nYour course access is now active in your dashboard.\n\nHappy Learning,\nVeoLMS Team`,
          html: `
            <div style="font-family: sans-serif; line-height: 1.5; color: #333;">
              <h2>Thank You for Your Order!</h2>
              <p>Hi <strong>${user.display_name}</strong>, your payment was successful.</p>
              <table style="width: 100%; max-width: 500px; border-collapse: collapse; margin: 16px 0;">
                <tr><td style="padding: 6px 0; border-bottom: 1px solid #eee;"><strong>Order Number:</strong></td><td style="text-align: right; padding: 6px 0; border-bottom: 1px solid #eee;">${order.order_number}</td></tr>
                <tr><td style="padding: 6px 0; border-bottom: 1px solid #eee;"><strong>Payment Reference:</strong></td><td style="text-align: right; padding: 6px 0; border-bottom: 1px solid #eee;">${paymentRef}</td></tr>
                <tr><td style="padding: 6px 0; border-bottom: 1px solid #eee;"><strong>Subtotal:</strong></td><td style="text-align: right; padding: 6px 0; border-bottom: 1px solid #eee;">${subtotalFormatted}</td></tr>
                <tr><td style="padding: 6px 0; border-bottom: 1px solid #eee;"><strong>Discount Applied:</strong></td><td style="text-align: right; padding: 6px 0; border-bottom: 1px solid #eee;">-${discountFormatted}</td></tr>
                <tr><td style="padding: 8px 0; font-size: 16px;"><strong>Total Paid:</strong></td><td style="text-align: right; padding: 8px 0; font-size: 16px;"><strong>${totalFormatted}</strong></td></tr>
              </table>
              <h3>Purchased Courses</h3>
              <ul style="padding-left: 20px;">
                ${itemsHtmlList}
              </ul>
              <p>You can now start learning immediately from your courses dashboard.</p>
            </div>
          `,
        });
      }
    } catch (sideEffectErr) {
      // Side effect failure is logged but NEVER disrupts payment/fulfillment success
      log?.error({ err: sideEffectErr }, "Post-purchase side effect execution encountered an error");
    }

    log?.info(
      { orderId: order.id, count: enrollmentResults.length },
      "Successfully fulfilled order and completed post-purchase side effects",
    );

    return {
      status: "processed" as const,
      orderId: order.id,
      enrollmentCount: enrollmentResults.length,
    };
  }

  async function handlePaymentFailed(
    event: NormalizedPaymentEvent,
    log?: FastifyBaseLogger,
  ) {
    if (!event.gatewayOrderId) return { status: "skipped" as const };

    const payment = await paymentRepo.findPaymentByGatewayOrderId(database, event.gatewayOrderId);
    if (!payment || payment.status === "captured") return { status: "skipped" as const };

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

    await webhookRepo.markWebhookEventProcessed(database, event.eventId);
    log?.info({ paymentId: payment.id }, "Payment failed record persisted");

    return { status: "processed" as const, orderId: payment.order_id };
  }

  async function handleRefundSucceeded(
    event: NormalizedPaymentEvent,
    log?: FastifyBaseLogger,
  ) {
    if (!event.gatewayPaymentId) return { status: "skipped" as const };

    const payment = await paymentRepo.findPaymentByGatewayPaymentId(database, event.gatewayPaymentId);
    if (!payment) return { status: "skipped" as const };

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

    await webhookRepo.markWebhookEventProcessed(database, event.eventId);
    log?.info({ orderId: payment.order_id, refundAmount }, "Refund processed successfully");

    return { status: "processed" as const, orderId: payment.order_id };
  }

  return {
    processPaymentJob,
  };
}
