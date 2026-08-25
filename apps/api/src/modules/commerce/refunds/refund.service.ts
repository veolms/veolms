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
  /**
   * Processes a refund (full or partial) via PaymentGateway and tracks refund status idempotently.
   */
  async function processRefund(
    adminUserId: string,
    request: CreateRefundRequest,
  ): Promise<Refund> {
    const { orderId, amount, reason } = request;

    const order = await orderRepo.findOrderById(database, orderId);
    if (!order) {
      throw CommerceErrors.ORDER_NOT_FOUND(orderId);
    }
    if (order.status !== "paid" && order.status !== "partially_refunded") {
      throw CommerceErrors.REFUND_NOT_ALLOWED("Order is not in a refundable state.");
    }

    const payment = await paymentRepo.findPaymentByOrderId(database, orderId);
    if (!payment || !payment.gateway_payment_id || payment.status !== "captured") {
      throw CommerceErrors.REFUND_NOT_ALLOWED("No captured payment exists for this order.");
    }

    // Calculate total already refunded
    const existingRefunds = await refundRepo.listRefundsByOrderId(database, orderId);
    const totalRefundedAlready = existingRefunds
      .filter((r) => r.status === "processed" || r.status === "pending")
      .reduce((sum, r) => sum + r.amount, 0);

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

    // 1. Dispatch refund through the PaymentGateway abstraction (outside DB transaction)
    const gatewayResult = await paymentGateway.refundPayment({
      gatewayPaymentId: payment.gateway_payment_id,
      amount: requestedAmount,
      currency: payment.currency,
      reason: reason ?? "Admin initiated refund",
      notes: {
        orderId: order.id,
        adminUserId,
      },
    });

    const now = new Date();
    const refundId = crypto.randomUUID();

    // 2. Transactionally record refund and update order state
    const createdRefund = await database.transaction().execute(async (trx) => {
      const record = await refundRepo.insertRefund(trx, {
        id: refundId,
        order_id: order.id,
        payment_id: payment.id,
        gateway_refund_id: gatewayResult.gatewayRefundId,
        amount: requestedAmount,
        currency: payment.currency,
        reason: reason ?? null,
        status: gatewayResult.status,
        created_by: adminUserId,
        created_at: now,
        updated_at: now,
      });

      const newTotalRefunded = totalRefundedAlready + requestedAmount;
      const isFullRefund = newTotalRefunded >= payment.amount;

      await orderRepo.updateOrderStatus(trx, order.id, {
        status: isFullRefund ? "refunded" : "partially_refunded",
        updated_at: now,
      });

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
