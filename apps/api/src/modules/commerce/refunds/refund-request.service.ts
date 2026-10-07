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
    return rows.map(toRefundRequestContract);
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

    const now = new Date();
    let refund: Refund | undefined;

    if (request.action === "approve") {
      // Execute the refund
      refund = await refundService.processRefund(adminUserId, {
        orderId: refundReq.order_id,
        reason: `Approved student request: ${refundReq.reason}`,
        preserveAccess: request.preserveAccess ?? false,
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
        refundRequest: toRefundRequestContract(updated!),
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
        refundRequest: toRefundRequestContract(updated!),
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
