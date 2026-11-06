import crypto from "node:crypto";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";
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
import {
  createRefundEligibilityService,
  toLearnerOrderRefund,
  type RefundEligibilityService,
} from "./refund-eligibility.service.ts";

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

function requestAlreadyExists(status: string): AppError {
  return new AppError(
    409,
    "REFUND_REQUEST_ALREADY_EXISTS",
    `A refund request for this order is already ${status}.`,
  );
}

export function createRefundRequestService({
  database,
  refundService,
  refundEligibility = createRefundEligibilityService({ database }),
}: {
  database: Kysely<Database>;
  refundService: Pick<RefundService, "processRefund">;
  refundEligibility?: RefundEligibilityService;
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

  /**
   * A learner asks for their purchase back from Purchase History.
   *
   * Only an eligible purchase is accepted (refund-eligibility.ts: within 30
   * days, no more watched than 10% or 10 hours), and it is refunded at once
   * with no staff review, its access ending as with any refund. The two
   * exceptions stay with staff as a pending request: a purchase paid by
   * bank or UPI transfer, whose money staff send back by hand, and one the
   * gateway did not refund (staff see it in the refund requests and retry).
   */
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

    const assessment = (
      await refundEligibility.assessOrders(userId, [orderId])
    ).get(orderId);
    if (!assessment) {
      throw new AppError(
        400,
        "REFUND_REQUEST_NOT_ALLOWED",
        "This purchase has nothing to refund.",
      );
    }
    if (assessment.requestStatus) {
      throw requestAlreadyExists(assessment.requestStatus);
    }
    if (!assessment.eligibility.eligible) {
      throw new AppError(
        400,
        "REFUND_NOT_ELIGIBLE",
        toLearnerOrderRefund(assessment).reasons.join(" "),
      );
    }

    const reason = request.reason?.trim() || "Requested from Purchase History";
    // One request per order, even for two taps at once: the order row is
    // locked while the request is looked for and written.
    const row = await database.transaction().execute(async (trx) => {
      await orderRepo.findOrderByIdForUpdate(trx, orderId);
      const existing = await refundRequestRepo.findRefundRequestByOrderId(
        trx,
        orderId,
      );
      if (existing) throw requestAlreadyExists(existing.status);
      const now = new Date();
      return refundRequestRepo.insertRefundRequest(trx, {
        id: crypto.randomUUID(),
        order_id: orderId,
        user_id: userId,
        reason,
        status: "pending",
        created_at: now,
        updated_at: now,
      });
    });

    if (assessment.manualTransfer) return toLearnerRefundRequest(row);

    try {
      // Started by the learner, so the refund is recorded as theirs.
      await refundService.processRefund(userId, {
        orderId,
        reason: `Automatic refund at the student's request: ${reason}`,
        preserveAccess: false,
      });
    } catch {
      // The gateway did not refund it (or did not say). The request stays
      // pending, so staff see it in the refund requests and finish it; the
      // refund service keeps its own record of the attempt.
      return toLearnerRefundRequest(row);
    }

    const approved = await refundRequestRepo.updateRefundRequestStatus(
      database,
      row.id,
      {
        status: "approved",
        admin_notes:
          "Refunded automatically: within 30 days, and no more watched than 10% or 10 hours.",
        resolved_at: new Date(),
      },
    );
    return toLearnerRefundRequest(approved ?? row);
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
