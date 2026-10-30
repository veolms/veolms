import crypto from "node:crypto";
import type { DatabaseExecutor as Executor } from "@veolms/database";
import type {
  LearnerRefundRequest,
  RefundRequest,
  RefundRequestStatus,
  CreateStudentRefundRequest,
  ReviewRefundRequest,
  Refund,
} from "@veolms/contracts";
import { AppError } from "../../../lib/errors.ts";
import { CommerceErrors } from "../shared/commerce.errors.ts";
import * as orderRepo from "../orders/order.repository.ts";
import * as paymentRepo from "../payments/payment.repository.ts";
import { isManualTransferProvider } from "./outside-refund.ts";
import * as refundRequestRepo from "./refund-request.repository.ts";
import {
  toLearnerRefundRequest,
  toRefundRequestContract,
} from "./refund.mapper.ts";
import type { RefundService } from "./refund.service.ts";

export interface RefundRequestService {
  submitStudentRefundRequest(
    userId: string,
    orderId: string,
    request: CreateStudentRefundRequest,
  ): Promise<LearnerRefundRequest>;
  listStudentRefundRequests(userId: string): Promise<LearnerRefundRequest[]>;
  listAllRefundRequests(status?: RefundRequestStatus): Promise<RefundRequest[]>;
  reviewRefundRequest(
    adminUserId: string,
    requestId: string,
    request: ReviewRefundRequest,
  ): Promise<{ refundRequest: RefundRequest; refund?: Refund }>;
}

export function createRefundRequestService({
  database,
  refundService,
}: {
  database: Executor;
  refundService: RefundService;
}): RefundRequestService {
  /** Of these orders, the ones paid by manual bank or UPI transfer. */
  async function ordersPaidByManualTransfer(
    orderIds: string[],
  ): Promise<Set<string>> {
    const payments = await paymentRepo.listPaymentProvidersByOrderIds(
      database,
      [...new Set(orderIds)],
    );
    return new Set(
      payments
        .filter((payment) => isManualTransferProvider(payment.gateway_provider))
        .map((payment) => payment.order_id),
    );
  }

  async function submitStudentRefundRequest(
    userId: string,
    orderId: string,
    request: CreateStudentRefundRequest,
  ): Promise<LearnerRefundRequest> {
    const order = await orderRepo.findOrderById(database, orderId);
    if (!order || order.user_id !== userId) {
      throw CommerceErrors.ORDER_NOT_FOUND(orderId);
    }

    if (order.status !== "paid") {
      throw new AppError(
        400,
        "REFUND_REQUEST_NOT_ALLOWED",
        "Only paid orders can be submitted for a refund.",
      );
    }

    const existing = await refundRequestRepo.findRefundRequestByOrderId(
      database,
      orderId,
    );
    if (existing) {
      throw new AppError(
        409,
        "REFUND_REQUEST_ALREADY_EXISTS",
        `A refund request for this order is already ${existing.status}.`,
      );
    }

    const now = new Date();
    const row = await refundRequestRepo.insertRefundRequest(database, {
      id: crypto.randomUUID(),
      order_id: orderId,
      user_id: userId,
      reason: request.reason,
      status: "pending",
      created_at: now,
      updated_at: now,
    });

    return toLearnerRefundRequest(row);
  }

  async function listStudentRefundRequests(
    userId: string,
  ): Promise<LearnerRefundRequest[]> {
    const rows = await refundRequestRepo.listRefundRequestsByUser(
      database,
      userId,
    );
    return rows.map(toLearnerRefundRequest);
  }

  async function listAllRefundRequests(
    status?: RefundRequestStatus,
  ): Promise<RefundRequest[]> {
    const rows = await refundRequestRepo.listAllRefundRequests(
      database,
      status,
    );
    const manual = await ordersPaidByManualTransfer(
      rows.map((row) => row.order_id),
    );
    return rows.map((row) =>
      toRefundRequestContract(row, manual.has(row.order_id)),
    );
  }

  async function reviewRefundRequest(
    adminUserId: string,
    requestId: string,
    request: ReviewRefundRequest,
  ): Promise<{ refundRequest: RefundRequest; refund?: Refund }> {
    const refundReq = await refundRequestRepo.findRefundRequestById(
      database,
      requestId,
    );
    if (!refundReq) {
      throw new AppError(
        404,
        "REFUND_REQUEST_NOT_FOUND",
        "Refund request not found.",
      );
    }

    if (refundReq.status !== "pending") {
      throw new AppError(
        400,
        "REFUND_REQUEST_ALREADY_RESOLVED",
        `This refund request has already been ${refundReq.status}.`,
      );
    }

    // A reference says money went back. Dropping it quietly on a rejection
    // would leave staff believing a refund had been recorded.
    if (request.action === "reject" && request.outsideRefund) {
      throw new AppError(
        400,
        "REFUND_REQUEST_REFERENCE_NOT_ALLOWED",
        "A transfer reference can only be recorded when the refund request is approved.",
      );
    }

    const now = new Date();
    let refund: Refund | undefined;
    const paidByManualTransfer = (
      await ordersPaidByManualTransfer([refundReq.order_id])
    ).has(refundReq.order_id);

    if (request.action === "approve") {
      // Execute the refund. For an order paid by manual transfer staff have
      // already sent the money back, and `outsideRefund` carries the
      // reference of that transfer: the refund is recorded, not made. The
      // refund service decides whether the marker fits the payment (required
      // for a manual transfer, refused for a gateway payment, one reference
      // recorded once), so approving here and refunding from the order
      // answer alike. Anything it refuses is thrown before the request is
      // touched, which leaves it pending.
      refund = await refundService.processRefund(adminUserId, {
        orderId: refundReq.order_id,
        reason: `Approved student request: ${refundReq.reason}`,
        preserveAccess: request.preserveAccess ?? false,
        ...(request.outsideRefund
          ? { outsideRefund: request.outsideRefund }
          : {}),
      });

      const updated = await refundRequestRepo.updateRefundRequestStatus(
        database,
        requestId,
        {
          status: "approved",
          admin_notes: request.adminNotes ?? null,
          resolved_at: now,
        },
      );

      return {
        refundRequest: toRefundRequestContract(updated!, paidByManualTransfer),
        refund,
      };
    } else {
      const updated = await refundRequestRepo.updateRefundRequestStatus(
        database,
        requestId,
        {
          status: "rejected",
          admin_notes: request.adminNotes ?? null,
          resolved_at: now,
        },
      );

      return {
        refundRequest: toRefundRequestContract(updated!, paidByManualTransfer),
      };
    }
  }

  return {
    submitStudentRefundRequest,
    listStudentRefundRequests,
    listAllRefundRequests,
    reviewRefundRequest,
  };
}
