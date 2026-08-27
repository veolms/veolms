import crypto from "node:crypto";
import type {
  Payment,
  PaymentGateway,
  PaymentProvider,
  VerifyPaymentRequest,
  VerifyPaymentResponse,
} from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";
import type { Executor } from "../shared/repository.types.ts";
import { CommerceErrors } from "../shared/commerce.errors.ts";
import * as paymentRepo from "./payment.repository.ts";
import * as orderRepo from "../orders/order.repository.ts";
import { createPaymentReconciliationService } from "./payment-reconciliation.service.ts";
import { toPaymentContract } from "./payment.mapper.ts";

export interface PaymentService {
  initializePayment(params: {
    orderId: string;
    customer: {
      id: string;
      name: string;
      email?: string | null;
      phone?: string | null;
    };
  }): Promise<{
    payment: Payment;
    gatewayOrder: {
      provider: PaymentProvider;
      gatewayOrderId: string;
      amount: number;
      currency: string;
      keyId?: string;
    };
  }>;
  verifyPayment(userId: string, input: VerifyPaymentRequest): Promise<VerifyPaymentResponse>;
  getPaymentById(paymentId: string): Promise<Payment | undefined>;
  getPaymentByOrderId(orderId: string): Promise<Payment | undefined>;
}

export interface PaymentServiceOptions {
  database: Kysely<Database>;
  paymentGateway: PaymentGateway;
}

export function createPaymentService({
  database,
  paymentGateway,
}: PaymentServiceOptions): PaymentService {
  const reconciliation = createPaymentReconciliationService({ database });
  /**
   * Initializes a payment for an internal pending order through the injected PaymentGateway.
   */
  async function initializePayment({
    orderId,
    customer,
  }: {
    orderId: string;
    customer: {
      id: string;
      name: string;
      email?: string | null;
      phone?: string | null;
    };
  }) {
    const order = await orderRepo.findOrderById(database, orderId);
    if (!order) {
      throw CommerceErrors.ORDER_NOT_FOUND(orderId);
    }
    if (order.status === "paid" || order.total_amount === 0) {
      throw CommerceErrors.ORDER_ALREADY_PAID();
    }
    if (new Date(order.expires_at) < new Date()) {
      throw CommerceErrors.ORDER_EXPIRED();
    }

    // 1. Check if a payment record already exists for this order
    let payment = await paymentRepo.findPaymentByOrderId(database, orderId);

    if (payment && payment.status === "captured") {
      throw CommerceErrors.PAYMENT_ALREADY_PROCESSED();
    }

    // 2. Create upstream order via the gateway abstraction (Razorpay, Stripe, etc.)
    const gatewayOrder = await paymentGateway.createOrder({
      orderId: order.id,
      orderNumber: order.order_number,
      amount: order.total_amount,
      currency: order.currency,
      receipt: order.order_number,
      customer,
      notes: {
        orderId: order.id,
        userId: order.user_id,
      },
    });

    if (!payment) {
      payment = await paymentRepo.insertPayment(database, {
        id: crypto.randomUUID(),
        order_id: order.id,
        gateway_provider: paymentGateway.providerName,
        gateway_order_id: gatewayOrder.gatewayOrderId,
        gateway_payment_id: null,
        gateway_key_id: gatewayOrder.keyId ?? null,
        amount: order.total_amount,
        currency: order.currency,
        status: "initiated",
      });
    } else {
      // A payment row already existed (e.g. an earlier abandoned/retried
      // checkout) but wasn't captured, so a fresh gateway order was just
      // created above. Without persisting its id here, the DB would keep
      // the stale gateway_order_id from the earlier attempt while the
      // client is handed this new one — verifyPayment's
      // findPaymentByGatewayOrderId(newId) would then find nothing and
      // throw PAYMENT_NOT_FOUND even though the gateway actually processed
      // the charge against the new order.
      const updated = await paymentRepo.updatePayment(database, payment.id, {
        gateway_order_id: gatewayOrder.gatewayOrderId,
        gateway_key_id: gatewayOrder.keyId ?? null,
        status: "initiated",
        error_code: null,
        error_description: null,
        updated_at: new Date(),
      });
      if (!updated) {
        throw new Error(
          `initializePayment: payment ${payment.id} disappeared while re-initializing`,
        );
      }
      payment = updated;
    }

    // Record initial payment attempt
    await paymentRepo.insertPaymentAttempt(database, {
      id: crypto.randomUUID(),
      payment_id: payment.id,
      gateway_payment_id: null,
      attempt_number: 1,
      status: "initiated",
    });

    return {
      payment: toPaymentContract(payment),
      gatewayOrder: {
        provider: gatewayOrder.provider,
        gatewayOrderId: gatewayOrder.gatewayOrderId,
        amount: gatewayOrder.amount,
        currency: gatewayOrder.currency,
        keyId: gatewayOrder.keyId,
      },
    };
  }

  /**
   * Verifies client payment signature and transitions order to PAID and fulfills enrollments.
   * Delegates concurrency-safe fulfillment to the PaymentReconciliationService so that
   * concurrent calls from /payments/verify and the Razorpay webhook cannot double-fulfill.
   */
  async function verifyPayment(userId: string, input: VerifyPaymentRequest): Promise<VerifyPaymentResponse> {
    const { orderId, gatewayOrderId, gatewayPaymentId, gatewaySignature } = input;

    const order = await orderRepo.findOrderById(database, orderId);
    if (!order || order.user_id !== userId) {
      // Do not reveal whether the order exists for another user
      throw CommerceErrors.ORDER_NOT_FOUND(orderId);
    }

    const payment = await paymentRepo.findPaymentByGatewayOrderId(database, gatewayOrderId);
    if (!payment) {
      throw CommerceErrors.PAYMENT_NOT_FOUND(gatewayOrderId);
    }

    // Idempotent short-circuit if already fully captured — safe to return early
    // without going to the gateway again (signature was already verified once).
    if (order.status === "paid" && payment.status === "captured") {
      return {
        verified: true,
        orderId: order.id,
        orderStatus: "paid",
        paymentStatus: "captured",
        message: "Payment already verified successfully.",
      };
    }

    // Reject payment verification for expired orders
    if (new Date(order.expires_at) < new Date()) {
      throw CommerceErrors.ORDER_EXPIRED();
    }

    // 1. Verify signature via Gateway Abstraction
    const isValid = paymentGateway.verifyPaymentSignature({
      gatewayOrderId,
      gatewayPaymentId,
      gatewaySignature,
    });

    if (!isValid) {
      // Record the failed attempt outside a transaction — it is diagnostic only
      const existingAttempts = await paymentRepo.listPaymentAttempts(database, payment.id);
      await paymentRepo.insertPaymentAttempt(database, {
        id: crypto.randomUUID(),
        payment_id: payment.id,
        gateway_payment_id: gatewayPaymentId,
        attempt_number: existingAttempts.length + 1,
        status: "failed",
        error_code: "SIGNATURE_VERIFICATION_FAILED",
        error_description: "Invalid payment signature.",
      });
      throw CommerceErrors.PAYMENT_SIGNATURE_INVALID();
    }

    // 2. Fetch authoritative payment status from Gateway (OUTSIDE transaction)
    const paymentDetails = await paymentGateway.getPayment(gatewayPaymentId);

    // Verify payment belongs to this gateway order
    if (paymentDetails.gatewayOrderId !== gatewayOrderId) {
      throw CommerceErrors.PAYMENT_NOT_FOUND(gatewayOrderId);
    }

    if (paymentDetails.amount !== order.total_amount) {
      throw CommerceErrors.PAYMENT_AMOUNT_MISMATCH();
    }
    if (paymentDetails.currency.toUpperCase() !== order.currency.toUpperCase()) {
      throw CommerceErrors.PAYMENT_CURRENCY_MISMATCH();
    }

    // Explicitly require captured status (authorized is not sufficient)
    if (paymentDetails.status !== "captured") {
      throw CommerceErrors.PAYMENT_NOT_CAPTURED(paymentDetails.status);
    }

    // 3. Concurrency-safe fulfillment — delegates to the PaymentReconciliationService.
    //    Both this path and the webhook worker converge here.
    //    The reconciliation service uses a conditional UPDATE as its concurrency gate
    //    so payment capture + order paid + coupon + access + enrollments happen exactly once.
    await reconciliation.finalizeSuccessfulPayment({
      paymentId: payment.id,
      gatewayPaymentId,
      paymentMethod: paymentDetails.method
        ? {
            method: paymentDetails.method,
            bank: paymentDetails.bank,
            wallet: paymentDetails.wallet,
            vpa: paymentDetails.vpa,
            cardLast4: paymentDetails.cardLast4,
          }
        : null,
    });

    return {
      verified: true,
      orderId: order.id,
      orderStatus: "paid",
      paymentStatus: "captured",
      message: "Payment verified and enrollments granted successfully.",
    };
  }


  async function getPaymentById(paymentId: string) {
    const p = await paymentRepo.findPaymentById(database, paymentId);
    if (!p) return undefined;
    return toPaymentContract(p);
  }

  async function getPaymentByOrderId(orderId: string) {
    const p = await paymentRepo.findPaymentByOrderId(database, orderId);
    if (!p) return undefined;
    return toPaymentContract(p);
  }

  // Note: refunds are NOT handled here. The real refund flow is
  // refund.service.ts's processRefund — transactional, checks the running
  // refund total against prior refunds, and passes an idempotency key to the
  // gateway. A duplicate, weaker refundPayment used to live on this service
  // (unreachable — no route ever called it) and was removed: it ran the
  // gateway call, refund insert, and order-status update as three separate
  // un-atomic awaits, never checked cumulative refunds, sent no idempotency
  // key, and carried the same single-event isFullRefund bug fixed in
  // handleRefundSucceeded. Wire refunds through refund.service.ts instead.

  return {
    initializePayment,
    verifyPayment,
    getPaymentById,
    getPaymentByOrderId,
  };
}
