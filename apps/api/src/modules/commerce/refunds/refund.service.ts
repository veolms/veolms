import crypto from "node:crypto";
import type {
  Refund,
  CreateRefundRequest,
  PaymentGateway,
} from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";
import { CommerceErrors } from "../shared/commerce.errors.ts";
import * as refundRepo from "./refund.repository.ts";
import * as orderRepo from "../orders/order.repository.ts";
import * as paymentRepo from "../payments/payment.repository.ts";
import { createCourseAccessService } from "../shared/course-access.service.ts";

export interface RefundService {
  processRefund(
    adminUserId: string,
    request: CreateRefundRequest,
  ): Promise<Refund>;
  getRefundById(refundId: string): Promise<Refund | undefined>;
  listRefundsForOrder(orderId: string): Promise<Refund[]>;
}

export function createRefundService({
  database,
  paymentGateway,
}: {
  database: Kysely<Database>;
  paymentGateway: PaymentGateway;
}): RefundService {
  const courseAccessService = createCourseAccessService();

  /**
   * Processes a refund (full or partial) via PaymentGateway and tracks refund status idempotently.
   *
   * Concurrency: two admin sessions (or a double-click) requesting a refund
   * for the same order at the same time must not both pass validation and
   * both fire a real, irreversible Razorpay refund. The old shape read
   * `existingRefunds` and validated with no lock, then called the gateway —
   * two concurrent calls could both read the same "already refunded" total
   * before either had written its own row. Fixed by splitting into a short
   * "reserve" transaction (locks the order row, revalidates and recomputes
   * the running total under that lock, inserts a `pending` refund row —
   * itself what the next concurrent request's total will see — before ever
   * calling the gateway) and a separate "finalize" step that updates that
   * same row once the gateway responds. The gateway call deliberately stays
   * outside both transactions: never hold a row lock across a network call.
   */
  async function processRefund(
    adminUserId: string,
    request: CreateRefundRequest,
  ): Promise<Refund> {
    const { orderId, amount, reason } = request;
    const refundId = crypto.randomUUID();

    // 1. Reserve — see the concurrency note above.
    const { order, payment, requestedAmount, totalRefundedAlready } = await database
      .transaction()
      .execute(async (trx) => {
        const order = await orderRepo.findOrderByIdForUpdate(trx, orderId);
        if (!order) {
          throw CommerceErrors.ORDER_NOT_FOUND(orderId);
        }
        if (order.status !== "paid" && order.status !== "partially_refunded") {
          throw CommerceErrors.REFUND_NOT_ALLOWED("Order is not in a refundable state.");
        }

        const payment = await paymentRepo.findPaymentByOrderId(trx, orderId);
        if (!payment || !payment.gateway_payment_id || payment.status !== "captured") {
          throw CommerceErrors.REFUND_NOT_ALLOWED("No captured payment exists for this order.");
        }

        // Calculate total already refunded — safe from the race now that
        // this read happens under the order row's lock. No exclusion
        // needed: this refund doesn't exist as a row yet.
        const totalRefundedAlready = await refundRepo.sumOtherCountedRefunds(trx, orderId);

        const maxRefundable = payment.amount - totalRefundedAlready;
        if (maxRefundable <= 0) {
          throw CommerceErrors.REFUND_NOT_ALLOWED("This order has already been fully refunded.");
        }

        const requestedAmount = amount ?? maxRefundable;
        if (requestedAmount > maxRefundable) {
          throw CommerceErrors.REFUND_NOT_ALLOWED(
            `Requested refund amount (${requestedAmount}) exceeds remaining refundable amount (${maxRefundable}).`,
          );
        }

        const now = new Date();
        await refundRepo.insertRefund(trx, {
          id: refundId,
          order_id: order.id,
          payment_id: payment.id,
          gateway_refund_id: null,
          amount: requestedAmount,
          currency: payment.currency,
          reason: reason ?? null,
          status: "pending",
          created_by: adminUserId,
          created_at: now,
          updated_at: now,
        });

        return { order, payment, requestedAmount, totalRefundedAlready };
      });

    // 2. Dispatch refund through the PaymentGateway abstraction (outside
    //    the reservation transaction/lock above).
    let gatewayResult;
    try {
      gatewayResult = await paymentGateway.refundPayment({
        gatewayPaymentId: payment.gateway_payment_id!,
        amount: requestedAmount,
        currency: payment.currency,
        reason: reason ?? "Admin initiated refund",
        idempotencyKey: refundId,
        notes: {
          orderId: order.id,
          adminUserId,
        },
      });
    } catch (err) {
      // Release the reservation so it doesn't permanently eat into this
      // order's refundable amount — a retry generates a fresh idempotency
      // key regardless, so there's no resumption path that depends on
      // keeping this row "pending".
      await refundRepo.updateRefundStatus(database, refundId, {
        status: "failed",
        updated_at: new Date(),
      });
      throw err;
    }

    const now = new Date();

    // 3. Finalize the reserved row (update, not insert) and update order
    //    state if the gateway settled the refund immediately.
    const isProcessed = gatewayResult.status === "processed";
    const newTotalRefunded = totalRefundedAlready + requestedAmount;
    const isFullRefund = isProcessed && newTotalRefunded >= payment.amount;

    const createdRefund = await database.transaction().execute(async (trx) => {
      const record = await refundRepo.updateRefundStatus(trx, refundId, {
        gateway_refund_id: gatewayResult.gatewayRefundId,
        status: gatewayResult.status,
        updated_at: now,
      });
      if (!record) {
        throw new Error(
          `processRefund: reserved refund row ${refundId} was not found at finalization`,
        );
      }

      // Only update order status, issue credit note, and revoke access if gateway settled the refund immediately
      if (isProcessed) {
        await orderRepo.updateOrderStatus(trx, order.id, {
          status: isFullRefund ? "refunded" : "partially_refunded",
          updated_at: now,
        });

        // Generate immutable Credit Note (FR-PAY-009)
        const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
        const hex = crypto.randomBytes(3).toString("hex").toUpperCase();
        const creditNoteNumber = `CN-${dateStr}-${hex}`;

        await trx
          .insertInto("credit_notes")
          .values({
            id: crypto.randomUUID(),
            credit_note_number: creditNoteNumber,
            refund_id: record.id,
            order_id: order.id,
            user_id: order.user_id,
            total_refund_amount: requestedAmount,
            tax_adjustment_amount: 0,
            created_at: now,
          })
          .execute();

        if (isFullRefund && !request.preserveAccess) {
          // Single shared owner of the access_grants + enrollments revoke
          // write — see course-access.service.ts.
          await courseAccessService.revokeAccessForOrder(trx, order);
        }
      }

      return record;
    });

    return {
      id: createdRefund.id,
      orderId: createdRefund.order_id,
      paymentId: createdRefund.payment_id,
      gatewayRefundId: createdRefund.gateway_refund_id,
      amount: createdRefund.amount,
      currency: createdRefund.currency,
      reason: createdRefund.reason,
      status: createdRefund.status as any,
      createdBy: createdRefund.created_by,
      createdAt: createdRefund.created_at,
      updatedAt: createdRefund.updated_at,
    };
  }

  async function getRefundById(refundId: string): Promise<Refund | undefined> {
    const r = await refundRepo.findRefundById(database, refundId);
    if (!r) return undefined;
    return {
      id: r.id,
      orderId: r.order_id,
      paymentId: r.payment_id,
      gatewayRefundId: r.gateway_refund_id,
      amount: r.amount,
      currency: r.currency,
      reason: r.reason,
      status: r.status as any,
      createdBy: r.created_by,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  async function listRefundsForOrder(orderId: string): Promise<Refund[]> {
    const list = await refundRepo.listRefundsByOrderId(database, orderId);
    return list.map((r) => ({
      id: r.id,
      orderId: r.order_id,
      paymentId: r.payment_id,
      gatewayRefundId: r.gateway_refund_id,
      amount: r.amount,
      currency: r.currency,
      reason: r.reason,
      status: r.status as any,
      createdBy: r.created_by,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  return {
    processRefund,
    getRefundById,
    listRefundsForOrder,
  };
}
