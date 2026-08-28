import crypto from "node:crypto";
import type { DatabaseExecutor as Executor } from "@veolms/database";
import type {
  ManualPaymentRequest,
  SubmitManualPaymentRequest,
  VerifyManualPaymentRequest,
} from "@veolms/contracts";
import { AppError } from "../../../lib/errors.ts";
import { CommerceErrors } from "../shared/commerce.errors.ts";
import * as orderRepo from "../orders/order.repository.ts";
import * as paymentRepo from "./payment.repository.ts";
import * as manualPaymentRepo from "./manual-payment.repository.ts";
import { createCourseAccessService } from "../shared/course-access.service.ts";

export interface ManualPaymentService {
  submitManualPayment(
    userId: string,
    orderId: string,
    request: SubmitManualPaymentRequest,
  ): Promise<ManualPaymentRequest>;
  listUserManualPayments(userId: string): Promise<ManualPaymentRequest[]>;
  listAllManualPayments(status?: string): Promise<ManualPaymentRequest[]>;
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

  async function submitManualPayment(
    userId: string,
    orderId: string,
    request: SubmitManualPaymentRequest,
  ): Promise<ManualPaymentRequest> {
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

    return {
      id: row.id,
      orderId: row.order_id,
      userId: row.user_id,
      paymentMethod: row.payment_method,
      transactionReference: row.transaction_reference,
      proofMediaId: row.proof_media_id,
      status: row.status as any,
      adminNotes: row.admin_notes,
      verifiedBy: row.verified_by,
      verifiedAt: row.verified_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async function listUserManualPayments(
    userId: string,
  ): Promise<ManualPaymentRequest[]> {
    const rows = await manualPaymentRepo.listManualPaymentRequestsByUser(
      database,
      userId,
    );
    return rows.map((r) => ({
      id: r.id,
      orderId: r.order_id,
      userId: r.user_id,
      paymentMethod: r.payment_method,
      transactionReference: r.transaction_reference,
      proofMediaId: r.proof_media_id,
      status: r.status as any,
      adminNotes: r.admin_notes,
      verifiedBy: r.verified_by,
      verifiedAt: r.verified_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  async function listAllManualPayments(
    status?: string,
  ): Promise<ManualPaymentRequest[]> {
    const rows = await manualPaymentRepo.listAllManualPaymentRequests(
      database,
      status as any,
    );
    return rows.map((r) => ({
      id: r.id,
      orderId: r.order_id,
      userId: r.user_id,
      paymentMethod: r.payment_method,
      transactionReference: r.transaction_reference,
      proofMediaId: r.proof_media_id,
      status: r.status as any,
      adminNotes: r.admin_notes,
      verifiedBy: r.verified_by,
      verifiedAt: r.verified_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
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
        const order = await orderRepo.findOrderById(trx, req.order_id);
        if (!order) {
          throw CommerceErrors.ORDER_NOT_FOUND(req.order_id);
        }

        // 1. Mark order as paid
        await orderRepo.markOrderPaidIfPending(trx, order.id, now);

        // 2. Insert manual payment record
        await paymentRepo.insertPayment(trx, {
          id: crypto.randomUUID(),
          order_id: order.id,
          gateway_provider: "manual",
          gateway_order_id: `manual_ord_${order.id}`,
          gateway_payment_id: `manual_pay_${req.transaction_reference}`,
          gateway_key_id: null,
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

        // 3. Grant course access & active enrollment with admin_grant source (audited manual grant)
        const orderItems = await orderRepo.listOrderItems(trx, order.id);
        await courseAccessService.grantAccessForOrder(trx, order, orderItems, now);

        // 4. Update manual payment request to verified
        await manualPaymentRepo.updateManualPaymentRequestStatus(
          trx,
          requestId,
          {
            status: "verified",
            admin_notes: request.adminNotes ?? null,
            verified_by: adminUserId,
            verified_at: now,
          },
        );
      });
    } else {
      await manualPaymentRepo.updateManualPaymentRequestStatus(
        database,
        requestId,
        {
          status: "rejected",
          admin_notes: request.adminNotes ?? null,
          verified_by: adminUserId,
          verified_at: now,
        },
      );
    }

    const updated = await manualPaymentRepo.findManualPaymentRequestById(
      database,
      requestId,
    );

    return {
      id: updated!.id,
      orderId: updated!.order_id,
      userId: updated!.user_id,
      paymentMethod: updated!.payment_method,
      transactionReference: updated!.transaction_reference,
      proofMediaId: updated!.proof_media_id,
      status: updated!.status as any,
      adminNotes: updated!.admin_notes,
      verifiedBy: updated!.verified_by,
      verifiedAt: updated!.verified_at,
      createdAt: updated!.created_at,
      updatedAt: updated!.updated_at,
    };
  }

  return {
    submitManualPayment,
    listUserManualPayments,
    listAllManualPayments,
    verifyManualPayment,
  };
}
