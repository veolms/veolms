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
import { toMinorUnits } from "../shared/currency.ts";
import * as orderRepo from "../orders/order.repository.ts";
import * as paymentRepo from "./payment.repository.ts";
import * as manualPaymentRepo from "./manual-payment.repository.ts";
import {
  toLearnerManualPayment,
  toManualPaymentContract,
} from "./payment.mapper.ts";
import { createCourseAccessService } from "../shared/course-access.service.ts";
import { createOutboxService } from "../../../events/outbox.service.ts";

export interface ManualPaymentService {
  submitManualPayment(
    userId: string,
    orderId: string,
    request: SubmitManualPaymentRequest,
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

    if (req.status !== "pending") {
      throw new AppError(
        400,
        "MANUAL_PAYMENT_ALREADY_RESOLVED",
        `Manual payment request has already been ${req.status}.`,
      );
    }

    const now = new Date();

    if (request.action === "verify") {
      // Execute verified approval inside transaction
      await database.transaction().execute(async (trx) => {
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

        // 3. Insert manual payment record
        const paymentId = crypto.randomUUID();
        await paymentRepo.insertPayment(trx, {
          id: paymentId,
          order_id: order.id,
          gateway_provider: "manual",
          gateway_order_id: `manual_ord_${order.id}`,
          gateway_payment_id: `manual_pay_${req.transaction_reference}`,
          gateway_key_id: null,
          // payments.amount is minor units for every provider; this row
          // used to store the major-unit order total.
          amount: toMinorUnits(order.total_amount, order.currency),
          currency: order.currency,
          status: "captured",
          payment_method: {
            method: req.payment_method,
            transactionReference: req.transaction_reference,
          },
          created_at: now,
          updated_at: now,
        });

        // 4. Grant course access & active enrollment with admin_grant source (audited manual grant)
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
          "pending",
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
    listUserManualPayments,
    listAllManualPayments,
    verifyManualPayment,
  };
}
