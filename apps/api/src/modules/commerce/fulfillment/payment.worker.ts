import crypto from "node:crypto";

import type { NormalizedPaymentEvent } from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { FastifyBaseLogger } from "fastify";
import type { Kysely } from "kysely";

import { createOutboxService } from "../../../events/outbox.service.ts";
import {
  createAccessService,
  type AccessService,
} from "../../access/access.service.ts";
import * as orderRepository from "../orders/order.repository.ts";
import { createPaymentReconciliationService } from "../payments/payment-reconciliation.service.ts";
import * as paymentRepository from "../payments/payment.repository.ts";
import * as refundRepository from "../refunds/refund.repository.ts";
import { createCourseAccessService } from "../shared/course-access.service.ts";
import * as webhookRepository from "../webhooks/webhook.repository.ts";

export interface PaymentWorkerOptions {
  database: Kysely<Database>;
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

export function createPaymentWorker({
  database,
  accessService = createAccessService(),
  logger,
}: PaymentWorkerOptions): PaymentWorker {
  const reconciliation = createPaymentReconciliationService({
    database,
    accessService,
  });
  const courseAccessService = createCourseAccessService({ accessService });
  const outbox = createOutboxService();

  async function processPaymentJob(event: NormalizedPaymentEvent) {
    const log = logger?.child({
      job: "payment-worker",
      eventId: event.eventId,
      eventType: event.eventType,
    });

    try {
      if (event.eventType === "payment.succeeded") {
        return await handlePaymentSucceeded(event, log);
      }
      if (event.eventType === "payment.failed") {
        return await handlePaymentFailed(event, log);
      }
      if (event.eventType === "refund.succeeded") {
        return await handleRefundSucceeded(event, log);
      }

      await webhookRepository.markWebhookEventProcessed(
        database,
        event.eventId,
      );
      return { status: "processed" as const };
    } catch (error) {
      log?.error({ err: error }, "Payment worker job execution failed");
      await webhookRepository.markWebhookEventFailed(
        database,
        event.eventId,
        error instanceof Error ? error.message : "Worker error",
      );
      throw error;
    }
  }

  async function handlePaymentSucceeded(
    event: NormalizedPaymentEvent,
    log?: FastifyBaseLogger,
  ) {
    if (!event.gatewayOrderId || !event.gatewayPaymentId) {
      log?.warn("Successful payment event is missing gateway identifiers");
      return { status: "skipped" as const };
    }

    const payment = await paymentRepository.findPaymentByGatewayOrderId(
      database,
      event.gatewayOrderId,
    );
    if (!payment) {
      log?.warn(
        { gatewayOrderId: event.gatewayOrderId },
        "No payment record found",
      );
      return { status: "skipped" as const };
    }

    const result = await reconciliation.finalizeSuccessfulPayment({
      paymentId: payment.id,
      gatewayPaymentId: event.gatewayPaymentId,
      paymentMethod: event.paymentMethod ?? null,
    });

    await webhookRepository.markWebhookEventProcessed(database, event.eventId);
    log?.info(
      {
        outcome: result.outcome,
        orderId: result.orderId,
        enrollmentCount: result.enrollmentCount,
      },
      "Payment event handled",
    );
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

    const payment = await paymentRepository.findPaymentByGatewayOrderId(
      database,
      event.gatewayOrderId,
    );
    if (!payment || payment.status === "captured") {
      return { status: "skipped" as const };
    }
    const order = await orderRepository.findOrderById(
      database,
      payment.order_id,
    );
    if (!order) return { status: "skipped" as const };

    const now = new Date();
    const changed = await database
      .transaction()
      .execute(async (transaction) => {
        const failed = await paymentRepository.transitionPaymentStatus(
          transaction,
          payment.id,
          "failed",
          ["initiated", "processing"],
          {
            error_code: event.errorCode ?? "PAYMENT_FAILED",
            error_description: event.errorDescription ?? "Payment failed",
            updated_at: now,
          },
        );
        if (!failed) return false;

        await paymentRepository.insertPaymentAttempt(transaction, {
          id: crypto.randomUUID(),
          payment_id: payment.id,
          gateway_payment_id: event.gatewayPaymentId ?? null,
          attempt_number: 1,
          status: "failed",
          error_code: event.errorCode ?? null,
          error_description: event.errorDescription ?? null,
        });
        await outbox.publish(transaction, {
          type: "payment.failed",
          version: 1,
          dedupeKey: `payment.failed:${payment.id}:${event.eventId}`,
          occurredAt: now,
          payload: {
            paymentId: payment.id,
            orderId: order.id,
            orderNumber: order.order_number,
            recipientUserId: order.user_id,
            reason: event.errorDescription ?? "Payment failed",
          },
        });
        return true;
      });

    await webhookRepository.markWebhookEventProcessed(database, event.eventId);
    log?.info({ paymentId: payment.id, changed }, "Payment failure handled");
    return { status: "processed" as const, orderId: payment.order_id };
  }

  async function handleRefundSucceeded(
    event: NormalizedPaymentEvent,
    log?: FastifyBaseLogger,
  ) {
    if (!event.gatewayPaymentId || !event.gatewayRefundId) {
      return { status: "skipped" as const };
    }

    const payment = await paymentRepository.findPaymentByGatewayPaymentId(
      database,
      event.gatewayPaymentId,
    );
    if (!payment) return { status: "skipped" as const };

    const order = await orderRepository.findOrderById(
      database,
      payment.order_id,
    );
    if (!order) return { status: "skipped" as const };

    const refundAmount = event.amount ?? payment.amount;
    const currency = event.currency ?? payment.currency;
    const now = new Date();
    let isFullRefund = false;

    await database.transaction().execute(async (transaction) => {
      const totalOtherRefunds = await refundRepository.sumOtherCountedRefunds(
        transaction,
        order.id,
        { gatewayRefundId: event.gatewayRefundId },
      );
      isFullRefund = totalOtherRefunds + refundAmount >= payment.amount;

      const refund = await refundRepository.upsertRefundByGatewayRefundId(
        transaction,
        {
          id: crypto.randomUUID(),
          order_id: payment.order_id,
          payment_id: payment.id,
          gateway_refund_id: event.gatewayRefundId!,
          amount: refundAmount,
          currency,
          status: "processed",
          updated_at: now,
        },
      );
      await orderRepository.updateOrderStatus(transaction, order.id, {
        status: isFullRefund ? "refunded" : "partially_refunded",
        updated_at: now,
      });

      if (isFullRefund) {
        await courseAccessService.revokeAccessForOrder(transaction, order);
      } else if (refund.order_item_id) {
        const targetItem = await orderRepository.findOrderItemById(
          transaction,
          refund.order_item_id,
        );
        if (targetItem) {
          await courseAccessService.revokeAccessForOrderItem(
            transaction,
            order,
            {
              item_type: targetItem.item_type,
              course_id: targetItem.course_id,
              bundle_id: targetItem.bundle_id,
            },
          );
        }
      }

      await outbox.publish(transaction, {
        type: "refund.completed",
        version: 1,
        dedupeKey: `refund.completed:${event.gatewayRefundId}`,
        occurredAt: now,
        payload: {
          refundId: refund.id,
          orderId: order.id,
          orderNumber: order.order_number,
          recipientUserId: order.user_id,
          amount: refundAmount,
          currency,
        },
      });
    });

    await webhookRepository.markWebhookEventProcessed(database, event.eventId);
    log?.info(
      { orderId: order.id, refundAmount, isFullRefund },
      "Refund processed successfully",
    );
    return { status: "processed" as const, orderId: order.id };
  }

  return { processPaymentJob };
}
