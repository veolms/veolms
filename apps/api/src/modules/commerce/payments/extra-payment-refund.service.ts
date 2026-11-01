import crypto from "node:crypto";
import type { PaymentGateway } from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { FastifyBaseLogger } from "fastify";
import type { Kysely, Transaction } from "kysely";
import { createOutboxService } from "../../../events/outbox.service.ts";
import * as orderRepo from "../orders/order.repository.ts";
import * as refundRepo from "../refunds/refund.repository.ts";
import { isDefinitiveGatewayRejection } from "../refunds/refund.service.ts";
import { AppError } from "../../../lib/errors.ts";
import {
  AUTO_REFUND_REASON,
  autoRefundAttemptDue,
  classifyAutoRefundFailure,
} from "./extra-payment.ts";
import * as paymentRepo from "./payment.repository.ts";
import {
  SURPLUS_CAPTURE_ERROR_CODE,
  applySurplusRefund,
} from "./surplus-payment.ts";

const outbox = createOutboxService();

/**
 * Records that the gateway has returned money of an extra payment (see
 * extra-payment.ts). The one place this is written, whoever learned of the
 * refund: the automatic refund's own answer, the gateway's refund event, or
 * the refund reconciliation pass.
 *
 * The order is none of this refund's business: its status, its access and
 * its own refunds stay as they are. The refund is noted on the payment row,
 * which becomes `refunded` once the whole amount is back and then leaves
 * the staff list. If a refund row was reserved for it (an automatic refund,
 * or a reservation this gateway refund matches), that row is completed
 * once: its credit note is issued and the buyer is told.
 *
 * Safe to run again for the same gateway refund: nothing is written twice.
 */
export async function settleExtraPaymentRefund(
  trx: Transaction<Database>,
  input: {
    paymentId: string;
    gatewayRefundId: string;
    amount: number;
    currency: string;
    now: Date;
  },
): Promise<{ paymentStatus: string | undefined; refundId?: string }> {
  const payment = await paymentRepo.findPaymentById(trx, input.paymentId);
  if (!payment) return { paymentStatus: undefined };

  // The order lock every refund path takes, so two refunds of the same
  // payment cannot both read the description before either writes it.
  const order = await orderRepo.findOrderByIdForUpdate(trx, payment.order_id);
  const current = await paymentRepo.findPaymentById(trx, payment.id);
  if (!current || !order) return { paymentStatus: current?.status };

  const reserved =
    (await refundRepo.findRefundByGatewayRefundId(
      trx,
      input.gatewayRefundId,
    )) ??
    (await refundRepo.adoptUnconfirmedReservation(trx, {
      paymentId: current.id,
      amount: input.amount,
      gatewayRefundId: input.gatewayRefundId,
      now: input.now,
    }));

  let refundId: string | undefined;
  if (reserved && reserved.payment_id === current.id) {
    refundId = reserved.id;
    if (reserved.status !== "processed") {
      await refundRepo.updateRefundStatus(trx, reserved.id, {
        gateway_refund_id: input.gatewayRefundId,
        status: "processed",
        updated_at: input.now,
      });

      const dateStr = input.now.toISOString().slice(0, 10).replace(/-/g, "");
      const hex = crypto.randomBytes(3).toString("hex").toUpperCase();
      await refundRepo.insertCreditNote(trx, {
        id: crypto.randomUUID(),
        credit_note_number: `CN-${dateStr}-${hex}`,
        refund_id: reserved.id,
        order_id: order.id,
        user_id: order.user_id,
        total_refund_amount: reserved.amount,
        created_at: input.now,
      });
      await outbox.publish(trx, {
        type: "refund.completed",
        version: 1,
        dedupeKey: `refund.completed:${reserved.id}`,
        occurredAt: input.now,
        payload: {
          refundId: reserved.id,
          orderId: order.id,
          orderNumber: order.order_number,
          recipientUserId: order.user_id,
          amount: reserved.amount,
          currency: reserved.currency,
        },
      });
    }
  }

  // Already returned in full: a repeat of something handled earlier.
  if (current.status !== "captured") {
    return { paymentStatus: current.status, refundId };
  }
  const next = applySurplusRefund(current, {
    gatewayRefundId: input.gatewayRefundId,
    amount: input.amount,
    currency: input.currency,
  });
  await paymentRepo.transitionPaymentStatus(
    trx,
    current.id,
    next.status,
    ["captured"],
    { error_description: next.errorDescription, updated_at: input.now },
  );
  return { paymentStatus: next.status, refundId };
}

export type ExtraPaymentRefundOutcome =
  /** The gateway returned the money. */
  | "refunded"
  /** The gateway accepted the refund and has not completed it yet. */
  | "accepted"
  /** Nothing to send: no refund is reserved, it is done, or it is not due. */
  | "skipped"
  /** The gateway refused. Staff refund it by hand; it is not tried again. */
  | "refused"
  /** The gateway could not be asked. It is tried again on a later pass. */
  | "retry_later";

export interface ExtraPaymentRefundService {
  /**
   * Sends the automatic refund reserved for an extra payment, if one is
   * reserved and due. Never throws: the payment that led here is final, and
   * a refund that could not be sent stays on the staff list.
   */
  refundExtraPayment(paymentId: string): Promise<ExtraPaymentRefundOutcome>;
  /** Sends every reserved automatic refund that is due. One bounded pass. */
  refundDueExtraPayments(): Promise<Record<ExtraPaymentRefundOutcome, number>>;
}

export function createExtraPaymentRefundService({
  database,
  paymentGateway,
  logger,
}: {
  database: Kysely<Database>;
  paymentGateway: PaymentGateway;
  logger?: FastifyBaseLogger;
}): ExtraPaymentRefundService {
  const log = logger?.child({ job: "extra-payment-refund" });

  async function send(paymentId: string): Promise<ExtraPaymentRefundOutcome> {
    const reservation = await refundRepo.findAutoRefundForPayment(
      database,
      paymentId,
    );
    if (
      !reservation ||
      reservation.status !== "pending" ||
      reservation.gateway_refund_id
    ) {
      return "skipped";
    }

    const payment = await paymentRepo.findPaymentById(database, paymentId);
    if (payment?.status === "refunded") {
      // The money went back another way (staff refunded it from the gateway
      // dashboard). The reservation has nothing left to do. Only while it
      // is still unsent: the refund that returned the money may have
      // completed this very row since it was read above.
      await refundRepo.failUnsentRefund(database, reservation.id, new Date());
      return "skipped";
    }
    if (
      !payment ||
      payment.status !== "captured" ||
      payment.error_code !== SURPLUS_CAPTURE_ERROR_CODE ||
      !payment.gateway_payment_id ||
      payment.gateway_provider !== paymentGateway.providerName
    ) {
      return "skipped";
    }

    const now = new Date();
    if (
      !autoRefundAttemptDue(
        {
          createdAt: reservation.created_at,
          lastTouchedAt: reservation.updated_at,
        },
        now,
      )
    ) {
      return "skipped";
    }
    // One caller per attempt: the webhook worker, the browser's
    // confirmation and the scheduled pass can all arrive here together.
    const mine = await refundRepo.claimAutoRefundAttempt(
      database,
      reservation.id,
      reservation.updated_at,
      now,
    );
    if (!mine) return "skipped";

    // Outside any transaction. The key is the reservation's id, the same on
    // every attempt, so the gateway answers a repeat with the refund it
    // already made instead of making another.
    let result: Awaited<ReturnType<PaymentGateway["refundPayment"]>>;
    try {
      result = await paymentGateway.refundPayment({
        gatewayPaymentId: payment.gateway_payment_id,
        amount: reservation.amount,
        currency: reservation.currency,
        reason: AUTO_REFUND_REASON,
        idempotencyKey: reservation.id,
        notes: {
          orderId: payment.order_id,
          paymentId: payment.id,
          automatic: "true",
        },
      });
    } catch (err) {
      const failure = classifyAutoRefundFailure({
        definitive: isDefinitiveGatewayRejection(err),
        statusCode: err instanceof AppError ? err.statusCode : undefined,
      });
      if (failure === "refused") {
        // Only while the reservation is still unsent: the money may have
        // gone back another way while the gateway was being asked (staff
        // refunded it from the gateway dashboard), and the refund event for
        // that completes this row. That must not be overwritten.
        await refundRepo.failUnsentRefund(database, reservation.id, new Date());
        // Logged as an error on purpose: someone has to return this money.
        log?.error(
          { err, paymentId: payment.id, orderId: payment.order_id },
          "The gateway refused the automatic refund of an extra payment; it stays on the staff list. Refund it from the gateway dashboard",
        );
        return "refused";
      }
      if (failure === "retry_needs_operator") {
        // Logged as an error each time, on purpose: the gateway did not
        // accept our credentials, and no refund goes out until they are
        // put right. The refund itself is kept and tried again.
        log?.error(
          { err, paymentId: payment.id, orderId: payment.order_id },
          "The gateway rejected our credentials for the automatic refund of an extra payment. Check the gateway keys; the refund stays on the staff list and is tried again later",
        );
        return "retry_later";
      }
      log?.warn(
        { err, paymentId: payment.id, orderId: payment.order_id },
        "The automatic refund of an extra payment could not be sent; it stays on the staff list and is tried again later",
      );
      return "retry_later";
    }

    const settledAt = new Date();
    if (result.status !== "processed") {
      // Accepted, not completed. The gateway's refund event or the refund
      // reconciliation pass completes it (settleExtraPaymentRefund).
      await refundRepo.finalizePendingRefund(database, reservation.id, {
        gateway_refund_id: result.gatewayRefundId,
        status: result.status === "failed" ? "failed" : "pending",
        updated_at: settledAt,
      });
      return result.status === "failed" ? "refused" : "accepted";
    }
    await database.transaction().execute(async (trx) => {
      // The order lock first, as every refund path takes it. Then the
      // gateway's id goes onto the reservation, so it is this row that is
      // completed below whatever amount the gateway answered with. If the
      // gateway's refund event got here first it is already on it.
      await orderRepo.findOrderByIdForUpdate(trx, payment.order_id);
      await refundRepo.finalizePendingRefund(trx, reservation.id, {
        gateway_refund_id: result.gatewayRefundId,
        status: "pending",
        updated_at: settledAt,
      });
      await settleExtraPaymentRefund(trx, {
        paymentId: payment.id,
        gatewayRefundId: result.gatewayRefundId,
        amount: result.amount,
        currency: result.currency,
        now: settledAt,
      });
    });
    log?.info(
      {
        paymentId: payment.id,
        orderId: payment.order_id,
        gatewayRefundId: result.gatewayRefundId,
        amount: result.amount,
      },
      "Extra payment refunded automatically",
    );
    return "refunded";
  }

  async function refundExtraPayment(
    paymentId: string,
  ): Promise<ExtraPaymentRefundOutcome> {
    try {
      return await send(paymentId);
    } catch (err) {
      log?.error(
        { err, paymentId },
        "Automatic refund of an extra payment failed; it stays on the staff list",
      );
      return "retry_later";
    }
  }

  async function refundDueExtraPayments() {
    const counts: Record<ExtraPaymentRefundOutcome, number> = {
      refunded: 0,
      accepted: 0,
      skipped: 0,
      refused: 0,
      retry_later: 0,
    };
    const unsent = await refundRepo.listDueAutoRefunds(database, {
      now: new Date(),
      gatewayProvider: paymentGateway.providerName,
    });
    // One at a time: there are only ever as many as there were extra
    // payments, and each is one gateway call.
    for (const reservation of unsent) {
      counts[await refundExtraPayment(reservation.payment_id)] += 1;
    }
    return counts;
  }

  return { refundExtraPayment, refundDueExtraPayments };
}
