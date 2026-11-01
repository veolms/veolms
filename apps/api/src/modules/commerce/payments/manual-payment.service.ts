import crypto from "node:crypto";
import type {
  DatabaseExecutor as Executor,
  ManualPaymentStatus,
} from "@veolms/database";
import type {
  LearnerManualPaymentRequest,
  ManualPaymentRequest,
  SubmitManualPaymentRequest,
  VerifyManualPaymentRequest,
} from "@veolms/contracts";
import { AppError } from "../../../lib/errors.ts";
import { CommerceErrors } from "../shared/commerce.errors.ts";
import { isUniqueViolation } from "../shared/db-errors.ts";
import { listHeldItemTitles } from "../shared/order-holdings.ts";
import { recordCouponRedemptionForPaidOrder } from "../coupons/coupon-redemption.service.ts";
import * as orderRepo from "../orders/order.repository.ts";
import * as paymentRepo from "./payment.repository.ts";
import * as manualPaymentRepo from "./manual-payment.repository.ts";
import {
  toLearnerManualPayment,
  toManualPaymentContract,
} from "./payment.mapper.ts";
import { createCourseAccessService } from "../shared/course-access.service.ts";
import { createOutboxService } from "../../../events/outbox.service.ts";
import { isOrderAlreadyPaid } from "./surplus-payment.ts";

export interface ManualPaymentService {
  submitManualPayment(
    userId: string,
    orderId: string,
    request: SubmitManualPaymentRequest,
  ): Promise<LearnerManualPaymentRequest>;
  /**
   * The buyer takes back the transfer they reported for their own order,
   * while staff have not answered it. Paying another way works again at
   * once.
   */
  withdrawManualPayment(
    userId: string,
    orderId: string,
  ): Promise<LearnerManualPaymentRequest>;
  listUserManualPayments(
    userId: string,
  ): Promise<LearnerManualPaymentRequest[]>;
  listAllManualPayments(
    status?: ManualPaymentStatus,
  ): Promise<ManualPaymentRequest[]>;
  verifyManualPayment(
    adminUserId: string,
    requestId: string,
    request: VerifyManualPaymentRequest,
  ): Promise<ManualPaymentRequest>;
}

/**
 * The payment id a verified transfer is recorded under. One bank or UPI
 * reference stands for one transfer, so it is compared without regard to
 * spacing or letter case; the column is unique, which is what stops one
 * transfer from paying for two orders.
 */
function manualGatewayPaymentId(transactionReference: string): string {
  return `${manualPaymentRepo.MANUAL_PAYMENT_ID_PREFIX}${transactionReference.replace(/\s+/gu, "").toUpperCase()}`;
}

function referenceAlreadyUsed(): AppError {
  return new AppError(
    409,
    "MANUAL_PAYMENT_REFERENCE_ALREADY_USED",
    "This transaction reference has already been used to verify a payment. Reject this request if it is a duplicate.",
  );
}

export function createManualPaymentService({
  database,
}: {
  database: Executor;
}): ManualPaymentService {
  const courseAccessService = createCourseAccessService();
  const outbox = createOutboxService();

  async function submitManualPayment(
    userId: string,
    orderId: string,
    request: SubmitManualPaymentRequest,
  ): Promise<LearnerManualPaymentRequest> {
    const order = await orderRepo.findOrderById(database, orderId);
    if (!order || order.user_id !== userId) {
      throw CommerceErrors.ORDER_NOT_FOUND(orderId);
    }

    if (order.status !== "pending") {
      throw new AppError(
        400,
        "INVALID_ORDER_STATE",
        `Manual payment can only be submitted for pending orders (current status: ${order.status}).`,
      );
    }

    const existing = await manualPaymentRepo.findManualPaymentRequestByOrderId(
      database,
      orderId,
    );
    if (existing && existing.status === "verified") {
      throw new AppError(
        409,
        "MANUAL_PAYMENT_ALREADY_VERIFIED",
        "A verified payment already exists for this order.",
      );
    }

    const now = new Date();

    // Accepted at once, also while a payment window for this order may
    // still be open (creating an order always opens one, so waiting for it
    // to close kept every buyer from reporting a transfer for 12 minutes).
    // From here on the gateway is closed for this purchase. If the buyer
    // completes the open window all the same, that payment pays the order
    // and this request is listed for staff as a transfer for a paid order;
    // it is never refunded by code, because code cannot see a bank account.

    const row = await manualPaymentRepo.insertManualPaymentRequest(database, {
      id: crypto.randomUUID(),
      order_id: orderId,
      user_id: userId,
      payment_method: request.paymentMethod,
      transaction_reference: request.transactionReference,
      proof_media_id: request.proofMediaId ?? null,
      status: "pending",
      created_at: now,
      updated_at: now,
    });

    return toLearnerManualPayment(row);
  }

  async function withdrawManualPayment(
    userId: string,
    orderId: string,
  ): Promise<LearnerManualPaymentRequest> {
    const order = await orderRepo.findOrderById(database, orderId);
    if (!order || order.user_id !== userId) {
      // Someone else's order answers like one that does not exist.
      throw CommerceErrors.ORDER_NOT_FOUND(orderId);
    }

    const withdrawn =
      await manualPaymentRepo.withdrawPendingManualPaymentRequests(
        database,
        orderId,
        new Date(),
      );
    const latest = withdrawn[0];
    if (!latest) {
      throw CommerceErrors.MANUAL_PAYMENT_NOT_PENDING();
    }
    return toLearnerManualPayment(latest);
  }

  async function listUserManualPayments(
    userId: string,
  ): Promise<LearnerManualPaymentRequest[]> {
    const rows = await manualPaymentRepo.listManualPaymentRequestsByUser(
      database,
      userId,
    );
    return rows.map(toLearnerManualPayment);
  }

  async function listAllManualPayments(
    status?: ManualPaymentStatus,
  ): Promise<ManualPaymentRequest[]> {
    const rows = await manualPaymentRepo.listAllManualPaymentRequests(
      database,
      status,
    );
    return rows.map(toManualPaymentContract);
  }

  async function verifyManualPayment(
    adminUserId: string,
    requestId: string,
    request: VerifyManualPaymentRequest,
  ): Promise<ManualPaymentRequest> {
    const req = await manualPaymentRepo.findManualPaymentRequestById(
      database,
      requestId,
    );
    if (!req) {
      throw new AppError(
        404,
        "MANUAL_PAYMENT_NOT_FOUND",
        "Manual payment request not found.",
      );
    }

    // A request the buyer withdrew can still be rejected, and only that.
    // Once its order was paid another way or closed it is on the staff
    // list of transfers to check (needs-refund.repository.ts): the buyer
    // may have sent the money all the same, and rejecting it is how staff
    // say it has been dealt with. It is never verified: the buyer took it
    // back, so it pays for nothing.
    if (req.status === "withdrawn" && request.action === "verify") {
      throw new AppError(
        400,
        "MANUAL_PAYMENT_ALREADY_RESOLVED",
        "The buyer withdrew this transfer report, so it cannot be verified. If the transfer arrived, return it outside the platform, then reject this request.",
      );
    }
    if (req.status !== "pending" && req.status !== "withdrawn") {
      throw new AppError(
        400,
        "MANUAL_PAYMENT_ALREADY_RESOLVED",
        `Manual payment request has already been ${req.status}.`,
      );
    }

    const now = new Date();

    if (request.action === "verify") {
      const gatewayPaymentId = manualGatewayPaymentId(
        req.transaction_reference,
      );
      // A reference that already paid for an order cannot pay for another.
      // This used to reach the unique column and fail as a 500, leaving a
      // request that could be neither verified nor understood.
      //
      // Looked up without regard to spacing or letter case on the stored
      // side as well: payments verified before references were normalised
      // hold the reference as it was typed, and an exact match let such a
      // reference be verified a second time.
      if (
        await paymentRepo.findManualPaymentByReference(
          database,
          gatewayPaymentId,
        )
      ) {
        throw referenceAlreadyUsed();
      }

      // Execute verified approval inside transaction
      await database
        .transaction()
        .execute(async (trx) => {
          // The buyer's checkout lock, then the order row, as a gateway
          // payment settling takes them: what the buyer has is read below,
          // and must not change before this is committed.
          await orderRepo.lockBuyerCheckout(trx, req.user_id);
          await orderRepo.findOrderByIdForUpdate(trx, req.order_id);

          // 1. Update manual payment request to verified atomically (must be pending)
          const updatedReq =
            await manualPaymentRepo.updateManualPaymentRequestStatus(
              trx,
              requestId,
              {
                status: "verified",
                admin_notes: request.adminNotes ?? null,
                verified_by: adminUserId,
                verified_at: now,
              },
              "pending",
            );
          if (!updatedReq) {
            throw new AppError(
              400,
              "MANUAL_PAYMENT_ALREADY_RESOLVED",
              "Manual payment request has already been resolved.",
            );
          }

          const order = await orderRepo.findOrderById(trx, req.order_id);
          if (!order) {
            throw CommerceErrors.ORDER_NOT_FOUND(req.order_id);
          }

          // The order was paid another way since the transfer was
          // reported (the buyer finished a gateway payment, or the request
          // went unanswered until they could pay again). Verifying it
          // would record a second payment for one order.
          if (isOrderAlreadyPaid(order.status)) {
            throw new AppError(
              400,
              "ORDER_CANNOT_BE_PAID",
              `Order ${order.order_number} has already been paid another way, so this transfer cannot be verified. If the transfer arrived, return it outside the platform, then reject this request.`,
            );
          }
          // The buyer came to have what the order sells some other way: a
          // newer order of theirs was paid, they enrolled for free, or
          // staff gave them access. This order would be a second payment
          // for it.
          const heldTitles = await listHeldItemTitles(trx, order, now);
          if (heldTitles.length > 0) {
            throw CommerceErrors.MANUAL_PAYMENT_ALREADY_COVERED(heldTitles);
          }

          // 2. Mark order as paid
          const markedPaid = await orderRepo.markOrderPaidIfPending(
            trx,
            order.id,
            now,
          );
          if (!markedPaid) {
            throw new AppError(
              400,
              "ORDER_CANNOT_BE_PAID",
              `Order ${order.id} is not in a payable status.`,
            );
          }

          // 3. The order is settled. A gateway payment the buyer started for
          //    it and left open is closed, so nothing keeps treating it as a
          //    payment in progress.
          await paymentRepo.closeOpenPaymentsForOrder(trx, order.id, {
            error_code: "SUPERSEDED_BY_MANUAL_PAYMENT",
            error_description:
              "The order was paid by a verified manual payment.",
            now,
          });

          // 4. Insert manual payment record
          const paymentId = crypto.randomUUID();
          await paymentRepo.insertPayment(trx, {
            id: paymentId,
            order_id: order.id,
            gateway_provider: "manual",
            gateway_order_id: `manual_ord_${order.id}`,
            gateway_payment_id: gatewayPaymentId,
            gateway_key_id: null,
            // payments.amount is minor units for every provider, as is the
            // order total it copies.
            amount: order.total_amount,
            currency: order.currency,
            status: "captured",
            payment_method: {
              method: req.payment_method,
              transactionReference: req.transaction_reference,
            },
            created_at: now,
            updated_at: now,
          });

          // 5. Count the coupon as used, exactly as a gateway payment does.
          await recordCouponRedemptionForPaidOrder(trx, {
            order,
            paymentId,
            now,
          });

          // 6. Grant course access & active enrollment with admin_grant source (audited manual grant)
          const orderItems = await orderRepo.listOrderItems(trx, order.id);
          await courseAccessService.grantAccessForOrder(
            trx,
            order,
            orderItems,
            now,
          );
          await outbox.publish(trx, {
            type: "payment.completed",
            version: 1,
            dedupeKey: `payment.completed:${paymentId}`,
            occurredAt: now,
            payload: {
              paymentId,
              orderId: order.id,
              orderNumber: order.order_number,
              recipientUserId: order.user_id,
              totalAmount: order.total_amount,
              currency: order.currency,
              itemTitles: orderItems.map((item) => item.title_snapshot),
            },
          });
        })
        .catch((error: unknown) => {
          // Two requests with one reference verified at the same moment:
          // the second meets the unique column after passing the check.
          // Only that column: any other unique violation in this
          // transaction is not about the reference.
          if (isUniqueViolation(error, "payments_gateway_payment_id_key")) {
            throw referenceAlreadyUsed();
          }
          throw error;
        });
    } else {
      const updatedReq =
        await manualPaymentRepo.updateManualPaymentRequestStatus(
          database,
          requestId,
          {
            status: "rejected",
            admin_notes: request.adminNotes ?? null,
            verified_by: adminUserId,
            verified_at: now,
          },
          // As it was read above: `pending`, or `withdrawn` by the buyer.
          req.status,
        );
      if (!updatedReq) {
        throw new AppError(
          400,
          "MANUAL_PAYMENT_ALREADY_RESOLVED",
          "Manual payment request has already been resolved.",
        );
      }
    }

    const updated = await manualPaymentRepo.findManualPaymentRequestById(
      database,
      requestId,
    );

    return toManualPaymentContract(updated!);
  }

  return {
    submitManualPayment,
    withdrawManualPayment,
    listUserManualPayments,
    listAllManualPayments,
    verifyManualPayment,
  };
}
