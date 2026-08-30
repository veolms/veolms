import crypto from "node:crypto";
import type { NormalizedPaymentEvent } from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";
import type { FastifyBaseLogger } from "fastify";
import type { EmailService } from "../../../services/email/index.ts";
import { escapeHtml } from "../../../services/email/email.templates.ts";
import { createAccessService, type AccessService } from "../../access/access.service.ts";
import * as paymentRepo from "../payments/payment.repository.ts";
import * as orderRepo from "../orders/order.repository.ts";
import * as refundRepo from "../refunds/refund.repository.ts";
import * as authRepo from "../../auth/authentication/authentication.repository.ts";
import * as setupRepo from "../../auth/setup/setup.repository.ts";
import * as webhookRepo from "../webhooks/webhook.repository.ts";
import {
  createPaymentReconciliationService,
} from "../payments/payment-reconciliation.service.ts";
import { createCourseAccessService } from "../shared/course-access.service.ts";

export interface PaymentWorkerOptions {
  database: Kysely<Database>;
  emailService?: EmailService;
  accessService?: AccessService;
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
 * Robust, idempotent background worker for processing payment confirmations.
 * Fulfillment (capture, order paid, coupon, access grants, enrollments, outbox)
 * is delegated to the PaymentReconciliationService which provides a single
 * concurrency-safe gate shared with the /payments/verify endpoint.
 */
export function createPaymentWorker({
  database,
  emailService,
  accessService = createAccessService(),
  logger,
}: PaymentWorkerOptions): PaymentWorker {
  const reconciliation = createPaymentReconciliationService({ database, accessService });
  const courseAccessService = createCourseAccessService({ accessService });

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
    } catch (err: unknown) {
      log?.error({ err }, `Payment worker job execution failed`);
      // Do NOT mark processed — leave processed_at NULL so the queue's
      // poller retries this event instead of burying it silently.
      await webhookRepo.markWebhookEventFailed(
        database,
        event.eventId,
        (err as Error)?.message || "Worker error",
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

    if (!event.gatewayPaymentId) {
      log?.warn("Event missing gatewayPaymentId, skipping");
      return { status: "skipped" as const };
    }

    const payment = await paymentRepo.findPaymentByGatewayOrderId(database, event.gatewayOrderId);
    if (!payment) {
      log?.warn(`No payment record found for gatewayOrderId: ${event.gatewayOrderId}`);
      return { status: "skipped" as const };
    }

    // Delegate to the reconciliation service — same function used by /payments/verify.
    // The conditional UPDATE inside ensures exactly-once fulfillment even when
    // verify and webhook race each other.
    const result = await reconciliation.finalizeSuccessfulPayment({
      paymentId: payment.id,
      gatewayPaymentId: event.gatewayPaymentId,
      paymentMethod: event.paymentMethod ?? null,
    });

    if (result.outcome === "already_captured") {
      log?.info(
        { paymentId: payment.id },
        "Payment already captured by another path (verify/webhook race); skipping fulfillment",
      );
    } else {
      log?.info(
        { orderId: result.orderId, enrollmentCount: result.enrollmentCount },
        "Payment finalized and enrollments granted",
      );
    }

    // Mark webhook processed regardless of outcome
    await webhookRepo.markWebhookEventProcessed(database, event.eventId);

    // Post-purchase side effects (non-blocking — failures must never affect payment/enrollment)
    if (result.outcome === "finalized" && result.orderId) {
      try {
        const order = await orderRepo.findOrderById(database, result.orderId);
        if (order) {
          const orderItems = await orderRepo.listOrderItems(database, order.id);
          const user = await authRepo.findUserById(database, order.user_id);

          const itemsSummary = orderItems
            .map((it) => `- ${it.title_snapshot} (₹${(it.final_amount / 100).toFixed(2)})`)
            .join("\n");
          const itemsHtmlList = orderItems
            .map(
              (it) =>
                `<li><strong>${escapeHtml(it.title_snapshot)}</strong>: ₹${(it.final_amount / 100).toFixed(2)}</li>`,
            )
            .join("");

          const subtotalFormatted = `₹${(order.subtotal_amount / 100).toFixed(2)}`;
          const discountFormatted = `₹${(order.discount_amount / 100).toFixed(2)}`;
          const totalFormatted = `₹${(order.total_amount / 100).toFixed(2)}`;
          const paymentRef = event.gatewayPaymentId ?? payment.gateway_payment_id ?? "N/A";

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

          const academy = await setupRepo.findAcademy(database);
          const academyName = academy?.name || "Academy";
          const displayName = user?.display_name || user?.username || "Student";
          const escapedAcademyName = escapeHtml(academyName);
          const escapedDisplayName = escapeHtml(displayName);
          const escapedOrderNumber = escapeHtml(order.order_number);
          const escapedPaymentRef = escapeHtml(paymentRef);

          let academyLogoHtml = "";
          if (academy?.logo_url) {
            try {
              const parsedLogoUrl = new URL(academy.logo_url);
              if (parsedLogoUrl.protocol === "http:" || parsedLogoUrl.protocol === "https:") {
                academyLogoHtml = `<div style="margin-bottom: 16px;"><img src="${escapeHtml(academy.logo_url)}" alt="${escapedAcademyName}" style="max-height: 48px; object-fit: contain;" /></div>`;
              }
            } catch {
              // Ignore invalid logo URL format
            }
          }

          if (emailService && user?.email) {
            await emailService.send(user.email, {
              subject: `Order Confirmation & Receipt - ${order.order_number}`,
              text: `Hi ${user.display_name},\n\nThank you for your purchase!\n\nOrder Number: ${order.order_number}\nSeller: ${academyName}\nPayment Reference: ${paymentRef}\nSubtotal: ${subtotalFormatted}\nDiscount: ${discountFormatted}\nTotal Paid: ${totalFormatted}\n\nPurchased Courses:\n${itemsSummary}\n\nYour course access is now active in your dashboard.\n\nHappy Learning,\n${academyName} Team`,
              html: `
                <div style="font-family: sans-serif; line-height: 1.5; color: #333;">
                  ${academyLogoHtml}
                  <h2>Thank You for Your Order!</h2>
                  <p>Hi <strong>${escapedDisplayName}</strong>, your payment to <strong>${escapedAcademyName}</strong> was successful.</p>
                  <table style="width: 100%; max-width: 500px; border-collapse: collapse; margin: 16px 0;">
                    <tr><td style="padding: 6px 0; border-bottom: 1px solid #eee;"><strong>Seller / Academy:</strong></td><td style="text-align: right; padding: 6px 0; border-bottom: 1px solid #eee;">${escapedAcademyName}</td></tr>
                    <tr><td style="padding: 6px 0; border-bottom: 1px solid #eee;"><strong>Order Number:</strong></td><td style="text-align: right; padding: 6px 0; border-bottom: 1px solid #eee;">${escapedOrderNumber}</td></tr>
                    <tr><td style="padding: 6px 0; border-bottom: 1px solid #eee;"><strong>Payment Reference:</strong></td><td style="text-align: right; padding: 6px 0; border-bottom: 1px solid #eee;">${escapedPaymentRef}</td></tr>
                    <tr><td style="padding: 6px 0; border-bottom: 1px solid #eee;"><strong>Subtotal:</strong></td><td style="text-align: right; padding: 6px 0; border-bottom: 1px solid #eee;">${subtotalFormatted}</td></tr>
                    <tr><td style="padding: 6px 0; border-bottom: 1px solid #eee;"><strong>Discount Applied:</strong></td><td style="text-align: right; padding: 6px 0; border-bottom: 1px solid #eee;">-${discountFormatted}</td></tr>
                    <tr><td style="padding: 8px 0; font-size: 16px;"><strong>Total Paid:</strong></td><td style="text-align: right; padding: 8px 0; font-size: 16px;"><strong>${totalFormatted}</strong></td></tr>
                  </table>
                  <h3>Purchased Courses</h3>
                  <ul style="padding-left: 20px;">
                    ${itemsHtmlList}
                  </ul>
                  <p>You can now start learning immediately from your courses dashboard.</p>
                  <p style="margin-top: 24px; font-size: 13px; color: #777;">&mdash; ${escapedAcademyName} Team</p>
                </div>
              `,
            });
          }
        }
      } catch (sideEffectErr) {
        log?.error({ err: sideEffectErr }, "Post-purchase side effect execution encountered an error");
      }
    }

    return {
      status: "processed" as const,
      orderId: result.orderId,
      enrollmentCount: result.enrollmentCount,
    };
  }

  async function handlePaymentFailed(
    event: NormalizedPaymentEvent,
    log?: FastifyBaseLogger,
  ) {
    if (!event.gatewayOrderId) return { status: "skipped" as const };

    const payment = await paymentRepo.findPaymentByGatewayOrderId(database, event.gatewayOrderId);
    if (!payment || payment.status === "captured") return { status: "skipped" as const };

    await paymentRepo.transitionPaymentStatus(
      database,
      payment.id,
      "failed",
      ["initiated", "processing"],
      {
        error_code: event.errorCode ?? "PAYMENT_FAILED",
        error_description: event.errorDescription ?? "Payment failed",
        updated_at: new Date(),
      },
    );

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
    if (!event.gatewayRefundId) return { status: "skipped" as const };

    const payment = await paymentRepo.findPaymentByGatewayPaymentId(database, event.gatewayPaymentId);
    if (!payment) return { status: "skipped" as const };

    const order = await orderRepo.findOrderById(database, payment.order_id);
    if (!order) return { status: "skipped" as const };

    const refundAmount = event.amount ?? payment.amount;
    const now = new Date();
    let isFullRefund = false;

    await database.transaction().execute(async (trx) => {
      // Cumulative check via the shared helper (see refund.repository.ts's
      // sumOtherCountedRefunds): a single webhook event's amount is not
      // enough on its own to detect a full refund — two separate 50%
      // gateway-side partial refunds each individually look partial
      // (refundAmount < payment.amount both times), so comparing only this
      // event's amount never flips isFullRefund to true and access is never
      // revoked. Excludes this event's own gateway_refund_id so a retried
      // webhook delivery for the same refund doesn't double-count it.
      const totalOtherRefundsAlready = await refundRepo.sumOtherCountedRefunds(trx, order.id, {
        gatewayRefundId: event.gatewayRefundId,
      });
      isFullRefund = totalOtherRefundsAlready + refundAmount >= payment.amount;

      const upsertedRefund = await refundRepo.upsertRefundByGatewayRefundId(trx, {
        id: crypto.randomUUID(),
        order_id: payment.order_id,
        payment_id: payment.id,
        gateway_refund_id: event.gatewayRefundId!,
        amount: refundAmount,
        currency: event.currency ?? payment.currency,
        status: "processed",
        updated_at: now,
      });

      await orderRepo.updateOrderStatus(trx, order.id, {
        status: isFullRefund ? "refunded" : "partially_refunded",
        updated_at: now,
      });

      if (isFullRefund) {
        // Single shared owner of the access_grants + enrollments revoke
        // write — see course-access.service.ts.
        await courseAccessService.revokeAccessForOrder(trx, order);
      } else if (upsertedRefund.order_item_id) {
        const targetItem = await orderRepo.findOrderItemById(trx, upsertedRefund.order_item_id);
        if (targetItem) {
          await courseAccessService.revokeAccessForOrderItem(trx, order, {
            item_type: targetItem.item_type,
            course_id: targetItem.course_id,
            bundle_id: targetItem.bundle_id,
          });
        }
      }
    });

    await webhookRepo.markWebhookEventProcessed(database, event.eventId);
    log?.info({ orderId: order.id, refundAmount, isFullRefund }, "Refund processed successfully");

    return { status: "processed" as const, orderId: order.id };
  }

  return {
    processPaymentJob,
  };
}
