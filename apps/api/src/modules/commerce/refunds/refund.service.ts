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
import { toRefundContract } from "./refund.mapper.ts";
import * as orderRepo from "../orders/order.repository.ts";
import * as paymentRepo from "../payments/payment.repository.ts";
import { createCourseAccessService } from "../shared/course-access.service.ts";
import { createOutboxService } from "../../../events/outbox.service.ts";

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
  const outbox = createOutboxService();

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
    const { orderId, orderItemId, amount, reason, idempotencyKey } = request;
    const refundId = crypto.randomUUID();

    // 1. Reserve — see the concurrency note above.
    const reservation = await database.transaction().execute(async (trx) => {
      const order = await orderRepo.findOrderByIdForUpdate(trx, orderId);
      if (!order) {
        throw CommerceErrors.ORDER_NOT_FOUND(orderId);
      }

      // Replay: the same key already produced a refund row for this order.
      // Checked under the order lock, so a concurrent duplicate blocks here
      // until the first request's reservation commits and then finds it.
      // Must run before the status check below — the first request may
      // already have moved the order to `refunded`.
      if (idempotencyKey) {
        const existing = await refundRepo.findRefundByIdempotencyKey(
          trx,
          order.id,
          idempotencyKey,
        );
        if (existing) {
          const sameRequest =
            existing.order_item_id === (orderItemId ?? null) &&
            (amount === undefined || existing.amount === amount);
          if (!sameRequest) {
            throw CommerceErrors.REFUND_IDEMPOTENCY_KEY_REUSED();
          }
          return { kind: "replay" as const, refund: existing };
        }
      }

      if (order.status !== "paid" && order.status !== "partially_refunded") {
        throw CommerceErrors.REFUND_NOT_ALLOWED(
          "Order is not in a refundable state.",
        );
      }

      let targetItem = null;
      if (orderItemId) {
        targetItem = await orderRepo.findOrderItemById(trx, orderItemId);
        if (!targetItem || targetItem.order_id !== orderId) {
          throw CommerceErrors.REFUND_NOT_ALLOWED(
            "Target order item not found on this order.",
          );
        }
      }

      const payment = await paymentRepo.findPaymentByOrderId(trx, orderId);
      if (
        !payment ||
        !payment.gateway_payment_id ||
        payment.status !== "captured"
      ) {
        throw CommerceErrors.REFUND_NOT_ALLOWED(
          "No captured payment exists for this order.",
        );
      }

      // Calculate total already refunded — safe from the race now that
      // this read happens under the order row's lock. No exclusion
      // needed: this refund doesn't exist as a row yet.
      const totalRefundedAlready = await refundRepo.sumOtherCountedRefunds(
        trx,
        orderId,
      );

      const maxRefundable = payment.amount - totalRefundedAlready;
      if (maxRefundable <= 0) {
        throw CommerceErrors.REFUND_NOT_ALLOWED(
          "This order has already been fully refunded.",
        );
      }

      // If orderItemId was provided without an explicit amount, default to target item final amount
      const requestedAmount =
        amount ??
        (targetItem
          ? Math.min(targetItem.final_amount, maxRefundable)
          : maxRefundable);
      if (requestedAmount > maxRefundable) {
        throw CommerceErrors.REFUND_NOT_ALLOWED(
          `Requested refund amount (${requestedAmount}) exceeds remaining refundable amount (${maxRefundable}).`,
        );
      }

      const now = new Date();
      await refundRepo.insertRefund(trx, {
        id: refundId,
        order_id: order.id,
        order_item_id: targetItem?.id ?? null,
        payment_id: payment.id,
        gateway_refund_id: null,
        amount: requestedAmount,
        currency: payment.currency,
        reason: reason ?? null,
        status: "pending",
        created_by: adminUserId,
        idempotency_key: idempotencyKey ?? null,
        created_at: now,
        updated_at: now,
      });

      return {
        kind: "reserved" as const,
        order,
        targetItem,
        payment,
        requestedAmount,
        totalRefundedAlready,
      };
    });

    if (reservation.kind === "replay") {
      return toRefundContract(reservation.refund);
    }

    const { order, targetItem, payment, requestedAmount, totalRefundedAlready } =
      reservation;

    // 2. Dispatch refund through the PaymentGateway abstraction (outside
    //    the reservation transaction/lock above).
    //
    //    With a client key the gateway key is derived from it, so a retry
    //    after an ambiguous failure (timeout where the gateway did settle)
    //    hits the gateway's own dedupe instead of issuing a second refund.
    //    Hashed to stay within any header length limit.
    const gatewayIdempotencyKey = idempotencyKey
      ? crypto
          .createHash("sha256")
          .update(`refund:${order.id}:${idempotencyKey}`)
          .digest("hex")
      : refundId;
    let gatewayResult;
    try {
      gatewayResult = await paymentGateway.refundPayment({
        gatewayPaymentId: payment.gateway_payment_id!,
        amount: requestedAmount,
        currency: payment.currency,
        reason: reason ?? "Admin initiated refund",
        idempotencyKey: gatewayIdempotencyKey,
        notes: {
          orderId: order.id,
          adminUserId,
          ...(targetItem ? { orderItemId: targetItem.id } : {}),
        },
      });
    } catch (err) {
      // Release the reservation so it doesn't permanently eat into this
      // order's refundable amount — there's no resumption path that
      // depends on keeping this row "pending". The client key is released
      // too so the caller can retry under the same key; the gateway key
      // derived from it keeps that retry safe.
      await refundRepo.updateRefundStatus(database, refundId, {
        status: "failed",
        idempotency_key: null,
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

        if (!request.preserveAccess) {
          if (isFullRefund) {
            // Full refund: revoke all access and enrollments for this order
            await courseAccessService.revokeAccessForOrder(trx, order);
          } else if (targetItem) {
            // Partial item-specific refund: revoke access specifically for this item
            await courseAccessService.revokeAccessForOrderItem(trx, order, {
              item_type: targetItem.item_type,
              course_id: targetItem.course_id,
              bundle_id: targetItem.bundle_id,
            });
          }
        }

        await outbox.publish(trx, {
          type: "refund.completed",
          version: 1,
          dedupeKey: `refund.completed:${record.id}`,
          occurredAt: now,
          payload: {
            refundId: record.id,
            orderId: order.id,
            orderNumber: order.order_number,
            recipientUserId: order.user_id,
            amount: requestedAmount,
            currency: payment.currency,
          },
        });
      }

      return record;
    });

    return toRefundContract(createdRefund);
  }

  async function getRefundById(refundId: string): Promise<Refund | undefined> {
    const r = await refundRepo.findRefundById(database, refundId);
    if (!r) return undefined;
    return toRefundContract(r);
  }

  async function listRefundsForOrder(orderId: string): Promise<Refund[]> {
    const list = await refundRepo.listRefundsByOrderId(database, orderId);
    return list.map(toRefundContract);
  }

  return {
    processRefund,
    getRefundById,
    listRefundsForOrder,
  };
}
