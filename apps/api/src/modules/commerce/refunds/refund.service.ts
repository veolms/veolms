import crypto from "node:crypto";
import type {
  Refund,
  CreateRefundRequest,
  GatewayRefundOutput,
  PaymentGateway,
} from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";
import { AppError } from "../../../lib/errors.ts";
import {
  CommerceErrors,
  toClientGatewayError,
} from "../shared/commerce.errors.ts";
import { isUniqueViolation } from "../shared/db-errors.ts";
import { outsideRefundId, refundChannelRefusal } from "./outside-refund.ts";
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

/**
 * Whether a gateway error proves no refund was created. Anything else — a
 * network failure, timeout, 5xx, an in-progress 409, an unreadable response —
 * leaves the outcome unknown: the gateway may well have processed it.
 */
export function isDefinitiveGatewayRejection(err: unknown): boolean {
  return (
    err instanceof AppError &&
    err.code === "PAYMENT_GATEWAY_ERROR" &&
    err.statusCode >= 400 &&
    err.statusCode < 500 &&
    err.statusCode !== 408 &&
    err.statusCode !== 409
  );
}

function outsideRefundAlreadyRecorded(): AppError {
  return new AppError(
    409,
    "REFUND_REFERENCE_ALREADY_USED",
    "A refund with this transfer reference has already been recorded. Check the reference; one transfer back can be recorded once.",
  );
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
   *
   * Outside refunds: an order paid by manual transfer has no gateway payment,
   * so staff return the money themselves and record it with
   * `request.outsideRefund`. Everything is the same except that the gateway
   * is not called: the reservation is finalized as `processed` under an id
   * made from the staff reference (see ./outside-refund.ts).
   */
  async function processRefund(
    adminUserId: string,
    request: CreateRefundRequest,
  ): Promise<Refund> {
    const { orderId, orderItemId, amount, reason, idempotencyKey } = request;
    const newRefundId = crypto.randomUUID();
    const outsideId = request.outsideRefund
      ? outsideRefundId(request.outsideRefund.reference)
      : null;
    if (request.outsideRefund && !outsideId) {
      throw CommerceErrors.REFUND_NOT_ALLOWED(
        "Enter the reference of the transfer the money was returned by.",
      );
    }

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
          // A key that recorded one transfer back cannot stand for another.
          const sameRequest =
            existing.order_item_id === (orderItemId ?? null) &&
            (amount === undefined || existing.amount === amount) &&
            (!outsideId ||
              !existing.gateway_refund_id ||
              existing.gateway_refund_id === outsideId);
          if (!sameRequest) {
            throw CommerceErrors.REFUND_IDEMPOTENCY_KEY_REUSED();
          }

          // Reserved but never confirmed by the gateway: the earlier attempt
          // failed with an unknown outcome or died mid-flight. Resume it
          // under the same gateway key instead of reporting it as done — the
          // gateway hands back the original refund if it was created.
          if (existing.status === "pending" && !existing.gateway_refund_id) {
            const payment = await paymentRepo.findPaymentById(
              trx,
              existing.payment_id,
            );
            if (!payment?.gateway_payment_id) {
              throw CommerceErrors.REFUND_NOT_ALLOWED(
                "No captured payment exists for this order.",
              );
            }
            const resumeRefusal = refundChannelRefusal(
              payment.gateway_provider,
              outsideId !== null,
            );
            if (resumeRefusal) {
              throw CommerceErrors.REFUND_NOT_ALLOWED(resumeRefusal);
            }
            const resumedItem = existing.order_item_id
              ? ((await orderRepo.findOrderItemById(
                  trx,
                  existing.order_item_id,
                )) ?? null)
              : null;
            return {
              kind: "dispatch" as const,
              refundId: existing.id,
              order,
              targetItem: resumedItem,
              payment,
              requestedAmount: existing.amount,
              totalRefundedAlready: await refundRepo.sumOtherCountedRefunds(
                trx,
                order.id,
                { refundId: existing.id },
              ),
            };
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

      // A no-cost order has a payment row of zero and nothing to return.
      // It used to be refused as "already fully refunded".
      if (payment.gateway_provider === "free" || payment.amount === 0) {
        throw CommerceErrors.REFUND_NOT_ALLOWED(
          "This order had no charge, so there is nothing to refund.",
        );
      }

      // A manual payment arrived by bank or UPI transfer, outside any
      // gateway, so there is no gateway payment to refund. Asked anyway, the
      // gateway refused the made-up payment id and every such refund failed
      // as a gateway error. It is refused here instead, before anything is
      // reserved or sent, and nothing about the order changes: this service
      // cannot move that money. The money is returned outside the platform,
      // and staff then record that with `outsideRefund`; only that explicit
      // marker records a refund this service did not make, and it is refused
      // in turn for a payment that did come through a gateway.
      const channelRefusal = refundChannelRefusal(
        payment.gateway_provider,
        outsideId !== null,
      );
      if (channelRefusal) {
        throw CommerceErrors.REFUND_NOT_ALLOWED(channelRefusal);
      }

      // One reference stands for one transfer back. The unique column
      // enforces it; asking first answers plainly before anything is
      // reserved. Two requests racing past this meet at finalization.
      if (
        outsideId &&
        (await refundRepo.findRefundByGatewayRefundId(trx, outsideId))
      ) {
        throw outsideRefundAlreadyRecorded();
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

      // If orderItemId was provided without an explicit amount, default to
      // the target item's final amount (minor units, like the payment and
      // refund amounts it is compared with).
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
        id: newRefundId,
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
        // Persisted so the webhook/reconciliation paths that may finish
        // this refund asynchronously honor the admin's choice.
        preserve_access: request.preserveAccess ?? false,
        created_at: now,
        updated_at: now,
      });

      return {
        kind: "dispatch" as const,
        refundId: newRefundId,
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

    const {
      refundId,
      order,
      targetItem,
      payment,
      requestedAmount,
      totalRefundedAlready,
    } = reservation;

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
    //
    //    An outside refund was already made by staff: there is nothing to
    //    send, and it is settled as soon as it is recorded.
    let gatewayResult: GatewayRefundOutput;
    try {
      gatewayResult = outsideId
        ? {
            gatewayRefundId: outsideId,
            amount: requestedAmount,
            currency: payment.currency,
            status: "processed",
          }
        : await paymentGateway.refundPayment({
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
      // Outcome unknown (timeout, 5xx, ...) and the caller can retry under
      // a key: keep the reservation `pending` with its key. It keeps
      // counting against the refundable amount, which is right if the
      // gateway did create the refund, and a retry with the same key resumes
      // it (see the replay branch above) under the same gateway key, so it
      // resolves to the original refund rather than a second one.
      // Both branches decide on the gateway's own status first; only what is
      // thrown to the caller is stripped of the provider's status and text.
      if (idempotencyKey && !isDefinitiveGatewayRejection(err)) {
        throw toClientGatewayError(err);
      }

      // Otherwise release the reservation so it doesn't permanently eat into
      // this order's refundable amount: either the gateway definitively
      // refused (no refund exists), or there is no key a retry could resume
      // it by. Clearing the key lets the caller start over under it.
      await refundRepo.updateRefundStatus(database, refundId, {
        status: "failed",
        idempotency_key: null,
        updated_at: new Date(),
      });
      throw toClientGatewayError(err);
    }

    const now = new Date();

    // 3. Finalize the reserved row (update, not insert) and update order
    //    state if the gateway settled the refund immediately.
    const isProcessed = gatewayResult.status === "processed";
    const newTotalRefunded = totalRefundedAlready + requestedAmount;
    const isFullRefund = isProcessed && newTotalRefunded >= payment.amount;

    // Set when another refund already holds this outside reference: the
    // reservation is released inside the transaction and the caller is told
    // once that has committed.
    let outsideReferenceTaken = false;
    const finalize = database.transaction().execute(async (trx) => {
      // The gateway returns the same refund for a repeated key, so the
      // webhook may have recorded it already: it upserts by gateway refund id
      // and can't see this reservation. It applied its own side effects, so
      // fold the reservation into that row instead of colliding on the unique
      // gateway_refund_id.
      const recorded = await refundRepo.findRefundByGatewayRefundId(
        trx,
        gatewayResult.gatewayRefundId,
      );
      if (recorded && recorded.id !== refundId) {
        // Release the key first: it is unique per order.
        await refundRepo.updateRefundStatus(trx, refundId, {
          status: "failed",
          idempotency_key: null,
          updated_at: now,
        });
        // An outside reference on another row is another refund, not this
        // one seen twice: there is nothing to fold into.
        if (outsideId) {
          outsideReferenceTaken = true;
          return recorded;
        }
        const adopted = await refundRepo.updateRefundStatus(trx, recorded.id, {
          status: recorded.status,
          ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
          updated_at: now,
        });
        return adopted ?? recorded;
      }

      // Conditional on still being unconfirmed: a concurrent request
      // resuming the same key may have finalized it first, and the side
      // effects below (credit note, access, outbox) must happen once.
      const record = await refundRepo.finalizePendingRefund(trx, refundId, {
        gateway_refund_id: gatewayResult.gatewayRefundId,
        status: gatewayResult.status,
        updated_at: now,
      });
      if (!record) {
        const current = await refundRepo.findRefundById(trx, refundId);
        if (!current) {
          throw new Error(
            `processRefund: reserved refund row ${refundId} was not found at finalization`,
          );
        }
        return current;
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
              id: targetItem.id,
              item_type: targetItem.item_type,
              course_id: targetItem.course_id,
              bundle_id: targetItem.bundle_id,
              quiz_pricing_id: targetItem.quiz_pricing_id,
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

    let createdRefund;
    try {
      createdRefund = await finalize;
    } catch (err) {
      // Two outside refunds with one reference finalizing at the same moment:
      // the second meets the unique column. Only that column, and only for
      // an outside refund; the reservation is released like any refused one.
      if (
        outsideId &&
        isUniqueViolation(err, "refunds_gateway_refund_id_key")
      ) {
        await refundRepo.updateRefundStatus(database, refundId, {
          status: "failed",
          idempotency_key: null,
          updated_at: new Date(),
        });
        throw outsideRefundAlreadyRecorded();
      }
      throw err;
    }
    if (outsideReferenceTaken) {
      throw outsideRefundAlreadyRecorded();
    }

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
