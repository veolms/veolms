import crypto from "node:crypto";

import type {
  NormalizedPaymentEvent,
  PaymentGateways,
} from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { FastifyBaseLogger } from "fastify";
import type { Kysely } from "kysely";

import { config } from "../../../config.ts";
import { createOutboxService } from "../../../events/outbox.service.ts";
import {
  createAccessService,
  type AccessService,
} from "../../access/access.service.ts";
import * as orderRepository from "../orders/order.repository.ts";
import { createPaymentReconciliationService } from "../payments/payment-reconciliation.service.ts";
import * as paymentRepository from "../payments/payment.repository.ts";
import { reportDuplicatePurchases } from "../payments/duplicate-purchase.ts";
import {
  createExtraPaymentRefundService,
  settleExtraPaymentRefund,
} from "../payments/extra-payment-refund.service.ts";
import {
  SURPLUS_CAPTURE_ERROR_CODE,
  isOrderAlreadyPaid,
} from "../payments/surplus-payment.ts";
import * as refundRepository from "../refunds/refund.repository.ts";
import { createCourseAccessService } from "../shared/course-access.service.ts";
import * as webhookRepository from "../webhooks/webhook.repository.ts";

export interface PaymentWorkerOptions {
  database: Kysely<Database>;
  accessService?: AccessService;
  logger?: FastifyBaseLogger;
  /**
   * With it, the automatic refund of an extra payment is sent as soon as
   * the payment has been recorded. Without it the refund is only reserved
   * here, and the scheduled pass sends it within a few minutes.
   */
  paymentGateways?: PaymentGateways;
  /** See `AUTO_REFUND_EXTRA_PAYMENTS`. */
  autoRefundExtraPayments?: boolean;
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
  paymentGateways,
  autoRefundExtraPayments = config.AUTO_REFUND_EXTRA_PAYMENTS,
}: PaymentWorkerOptions): PaymentWorker {
  const reconciliation = createPaymentReconciliationService({
    database,
    accessService,
    autoRefundExtraPayments,
  });
  const extraPaymentRefunds = paymentGateways
    ? createExtraPaymentRefundService({ database, paymentGateways, logger })
    : undefined;
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
      // Failure bookkeeping (error column, retry backoff, dead-lettering)
      // belongs to the queue's catch in payment-event.queue.ts — writing the
      // error here too would race/overwrite its backoff scheduling.
      log?.error({ err: error }, "Payment worker job execution failed");
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
      // Do NOT swallow this as "skipped": a missing payment row usually means
      // the webhook raced checkout's payment insert, or the user paid against
      // a gateway order that a payment re-initialization replaced. Marking the
      // event processed here would bury a CAPTURED payment with no
      // fulfillment and no alert. Throwing lets the queue retry with backoff
      // and dead-letter it (visibly) if the payment row never appears.
      log?.warn(
        { gatewayOrderId: event.gatewayOrderId },
        "No payment record found for successful payment event; will retry",
      );
      throw new Error(
        `No payment record found for gateway order ${event.gatewayOrderId}`,
      );
    }

    const result = await reconciliation.finalizeSuccessfulPayment({
      paymentId: payment.id,
      gatewayPaymentId: event.gatewayPaymentId,
      paymentMethod: event.paymentMethod ?? null,
    });
    // A payment in another currency: what it settles for, for the revenue
    // reports. Whichever path saw the capture first records it.
    if (
      (result.outcome === "finalized" ||
        result.outcome === "already_captured") &&
      event.settlementAmount !== undefined &&
      event.settlementCurrency
    ) {
      await orderRepository.recordOrderSettlement(database, payment.order_id, {
        amount: event.settlementAmount,
        currency: event.settlementCurrency,
      });
    }

    await webhookRepository.markWebhookEventProcessed(database, event.eventId);
    if (
      result.outcome === "recorded_as_surplus" ||
      result.outcome === "recorded_as_extra"
    ) {
      const details = {
        paymentId: payment.id,
        orderId: result.orderId,
        gatewayPaymentId: event.gatewayPaymentId,
        amount: payment.amount,
        currency: payment.currency,
      };
      if (result.autoRefundReserved) {
        log?.warn(
          details,
          result.outcome === "recorded_as_surplus"
            ? "Gateway payment captured for an order that was already paid; nothing granted, and it is being refunded automatically"
            : "Gateway payment captured for something the buyer already has, or for an order that had been closed; nothing granted, and it is being refunded automatically",
        );
        // After the event is marked processed: the payment is recorded, and
        // a refund that cannot be sent now is sent by the scheduled pass.
        await extraPaymentRefunds?.refundExtraPayment(payment.id);
      } else {
        // Logged as an error on purpose: someone has to return this money.
        log?.error(
          details,
          result.outcome === "recorded_as_surplus"
            ? "Gateway payment captured for an order that was already paid; recorded as a surplus payment, nothing granted. Refund it from the gateway dashboard"
            : "Gateway payment captured for an order that had been closed and cannot be paid; recorded as an extra payment, nothing granted. Refund it from the gateway dashboard",
        );
      }
    }
    if (result.outcome === "finalized" && result.orderId && result.userId) {
      // The other way money ends up needing a refund: this capture paid an
      // order for a course the buyer already holds a paid order for (see
      // duplicate-purchase.ts). Logged as an error too, for the same reason.
      await reportDuplicatePurchases({
        database,
        log,
        order: { id: result.orderId, userId: result.userId },
        payment: {
          id: payment.id,
          gatewayPaymentId: event.gatewayPaymentId,
          amount: payment.amount,
          currency: payment.currency,
        },
      });
    }
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

        const attemptCount = await paymentRepository.countPaymentAttempts(
          transaction,
          payment.id,
        );
        await paymentRepository.insertPaymentAttempt(transaction, {
          id: crypto.randomUUID(),
          payment_id: payment.id,
          gateway_payment_id: event.gatewayPaymentId ?? null,
          attempt_number: attemptCount + 1,
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

    let payment = await paymentRepository.findPaymentByGatewayPaymentId(
      database,
      event.gatewayPaymentId,
    );
    if (!payment) {
      // No payment recorded under this id. If the refund is for one of our
      // gateway orders whose capture has not been recorded yet (events can
      // arrive out of order), dropping it here lost the refund for good: the
      // order stayed paid and kept its access. Throwing has the queue try
      // again, by which time the capture is in. A refund for a payment that
      // is not ours at all is still skipped.
      const pending = event.gatewayOrderId
        ? await paymentRepository.findPaymentByGatewayOrderId(
            database,
            event.gatewayOrderId,
          )
        : undefined;
      if (!pending || pending.status === "captured") {
        return { status: "skipped" as const };
      }
      // Unless the order was paid another way in the meantime. Then the
      // capture this refund belongs to is a surplus payment whose own event
      // never arrived (or was dead-lettered before surplus payments were
      // recorded), and waiting for it only dead-letters the refund as well.
      // A refund proves the capture, so it is recorded here first.
      payment = await recordSurplusCaptureKnownByItsRefund(
        pending,
        event.gatewayPaymentId,
      );
      if (!payment) {
        log?.warn(
          { gatewayOrderId: event.gatewayOrderId },
          "Refund event arrived before its payment was recorded as captured; will retry",
        );
        throw new Error(
          `Refund ${event.gatewayRefundId} arrived before the capture of gateway order ${event.gatewayOrderId} was recorded`,
        );
      }
    }

    if (payment.error_code === SURPLUS_CAPTURE_ERROR_CODE) {
      return await handleSurplusRefund(
        event,
        payment,
        event.gatewayRefundId,
        log,
      );
    }

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
      // Same order lock the admin refund path takes for its reservation, so
      // the two cannot interleave their reads of "refunded so far".
      await orderRepository.findOrderByIdForUpdate(transaction, order.id);

      // If this gateway refund is not recorded yet, it may be the one an
      // admin request has reserved but not finished recording. Continue that
      // row rather than inserting a second row for the same refund.
      const recorded = await refundRepository.findRefundByGatewayRefundId(
        transaction,
        event.gatewayRefundId!,
      );
      if (!recorded) {
        await refundRepository.adoptUnconfirmedReservation(transaction, {
          paymentId: payment.id,
          amount: refundAmount,
          gatewayRefundId: event.gatewayRefundId!,
          now,
        });
      }

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

      if (refund.preserve_access) {
        // Admin-created refunds can opt to keep the learner's access; the
        // upsert above adopts such a row by gateway_refund_id, so honor it.
      } else if (isFullRefund) {
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
              id: targetItem.id,
              item_type: targetItem.item_type,
              course_id: targetItem.course_id,
              bundle_id: targetItem.bundle_id,
              quiz_pricing_id: targetItem.quiz_pricing_id,
            },
          );
        }
      }

      // Keyed by the refund ROW id, matching refund.service.ts and
      // refund-reconciliation.worker.ts — the webhook adopts the admin's
      // row via upsertRefundByGatewayRefundId, so all three paths now
      // produce the same key and the outbox dedupes to one notification.
      await outbox.publish(transaction, {
        type: "refund.completed",
        version: 1,
        dedupeKey: `refund.completed:${refund.id}`,
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

  type PaymentRow = NonNullable<
    Awaited<ReturnType<typeof paymentRepository.findPaymentById>>
  >;

  /**
   * Records, as a surplus payment, a capture that is only known from a
   * refund of it. Only for a payment row whose order has already been paid
   * another way; returns nothing otherwise, and the caller keeps waiting for
   * the capture as before.
   */
  async function recordSurplusCaptureKnownByItsRefund(
    pending: PaymentRow,
    gatewayPaymentId: string,
  ): Promise<PaymentRow | undefined> {
    const order = await orderRepository.findOrderById(
      database,
      pending.order_id,
    );
    if (!order || !isOrderAlreadyPaid(order.status)) return undefined;

    // The same path a capture event takes. For an order that is already
    // paid it can only record the payment as surplus or leave it alone. No
    // automatic refund is reserved: the gateway has refunded this payment
    // already, which is how it came to be known.
    await reconciliation.finalizeSuccessfulPayment({
      paymentId: pending.id,
      gatewayPaymentId,
      paymentMethod: pending.payment_method,
      skipAutoRefund: true,
    });
    const recorded = await paymentRepository.findPaymentByGatewayPaymentId(
      database,
      gatewayPaymentId,
    );
    return recorded?.error_code === SURPLUS_CAPTURE_ERROR_CODE
      ? recorded
      : undefined;
  }

  /**
   * A refund of a surplus payment (see surplus-payment.ts). The money goes
   * back to the buyer and the order is none of its business: its status, its
   * access and its own refunds stay as they are. The refund is noted on the
   * payment row, which becomes `refunded` once the whole amount is back.
   */
  async function handleSurplusRefund(
    event: NormalizedPaymentEvent,
    payment: PaymentRow,
    gatewayRefundId: string,
    log?: FastifyBaseLogger,
  ) {
    const now = new Date();
    const refundAmount = event.amount ?? payment.amount;
    let status: string = payment.status;

    await database.transaction().execute(async (transaction) => {
      // Shared with the automatic refund, which may be what the gateway is
      // reporting here: its reserved row is completed by whichever of the
      // two hears of the refund first.
      const settled = await settleExtraPaymentRefund(transaction, {
        paymentId: payment.id,
        gatewayRefundId,
        amount: refundAmount,
        currency: event.currency ?? payment.currency,
        now,
      });
      status = settled.paymentStatus ?? status;
    });

    await webhookRepository.markWebhookEventProcessed(database, event.eventId);
    log?.info(
      {
        paymentId: payment.id,
        orderId: payment.order_id,
        refundAmount,
        paymentStatus: status,
      },
      "Refund of a surplus payment recorded; the order was not changed",
    );
    return { status: "processed" as const, orderId: payment.order_id };
  }

  return { processPaymentJob };
}
