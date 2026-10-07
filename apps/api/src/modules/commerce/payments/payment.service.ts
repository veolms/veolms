import crypto from "node:crypto";
import type {
  PaymentGateway,
  PaymentProvider,
  VerifyPaymentRequest,
  VerifyPaymentResponse,
} from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";
import {
  CommerceErrors,
  toClientGatewayError,
} from "../shared/commerce.errors.ts";
import { toMinorUnits } from "../shared/currency.ts";
import { isUniqueViolation } from "../shared/db-errors.ts";
import * as paymentRepo from "./payment.repository.ts";
import * as orderRepo from "../orders/order.repository.ts";
import { createPaymentReconciliationService } from "./payment-reconciliation.service.ts";
import { toPaymentProvider } from "./payment.mapper.ts";

/**
 * Course pricing is currently stored in major currency units (for example,
 * 499 means ₹499). Payment gateways expect the amount in the currency's
 * smallest unit (for INR, 49900 paise). Keep this conversion at the gateway
 * boundary so internal course/order pricing remains unchanged. Shared with
 * the refund paths so full/partial comparisons use one definition.
 */
function toGatewayAmount(amount: number, currency: string): number {
  return toMinorUnits(amount, currency);
}

/** The order columns `initializePayment` works from. */
type PaymentOrderRow = Pick<
  NonNullable<Awaited<ReturnType<typeof orderRepo.findOrderById>>>,
  | "id"
  | "order_number"
  | "user_id"
  | "status"
  | "currency"
  | "total_amount"
  | "expires_at"
>;

export interface PaymentService {
  initializePayment(params: {
    orderId: string;
    /**
     * The order row, when the caller has only just written it. Saves reading
     * back a row that cannot have changed yet.
     */
    order?: PaymentOrderRow;
    customer: {
      id: string;
      name: string;
      email?: string | null;
      phone?: string | null;
    };
  }): Promise<{
    gatewayOrder: {
      provider: PaymentProvider;
      gatewayOrderId: string;
      amount: number;
      currency: string;
      keyId?: string;
    };
  }>;
  verifyPayment(
    userId: string,
    input: VerifyPaymentRequest,
  ): Promise<VerifyPaymentResponse>;
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
    order: knownOrder,
    customer,
  }: {
    orderId: string;
    order?: PaymentOrderRow;
    customer: {
      id: string;
      name: string;
      email?: string | null;
      phone?: string | null;
    };
  }) {
    const order =
      knownOrder ?? (await orderRepo.findOrderById(database, orderId));
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

    const gatewayAmount = toGatewayAmount(order.total_amount, order.currency);

    // 2. Reuse an in-flight gateway order when nothing changed. Every
    //    re-initialization used to create a FRESH gateway order and
    //    overwrite gateway_order_id — but the old gateway order stays
    //    payable at the provider, so a user paying it (second tab, slow
    //    checkout page, double click) produced captured money attached to
    //    a gateway order id no payment row references anymore.
    const isReusable =
      payment &&
      (payment.status === "initiated" || payment.status === "processing") &&
      payment.gateway_order_id !== null &&
      payment.amount === gatewayAmount &&
      payment.currency === order.currency &&
      payment.gateway_provider === paymentGateway.providerName;

    if (payment && isReusable) {
      await recordPaymentAttempt(payment.id);
      return {
        gatewayOrder: {
          provider: toPaymentProvider(payment.gateway_provider),
          gatewayOrderId: payment.gateway_order_id!,
          amount: payment.amount,
          currency: payment.currency,
          keyId: payment.gateway_key_id ?? undefined,
        },
      };
    }

    // 3. Create upstream order via the gateway abstraction (Razorpay, Stripe, etc.).
    // The gateway receives minor units; the internal order remains in the
    // major-unit format used by the current course-pricing configuration.
    const gatewayOrder = await paymentGateway
      .createOrder({
        orderId: order.id,
        orderNumber: order.order_number,
        amount: gatewayAmount,
        currency: order.currency,
        receipt: order.order_number,
        customer,
        notes: {
          orderId: order.id,
          userId: order.user_id,
        },
      })
      .catch((err: unknown) => {
        throw toClientGatewayError(err);
      });

    if (!payment) {
      try {
        payment = await paymentRepo.insertPayment(database, {
          id: crypto.randomUUID(),
          order_id: order.id,
          gateway_provider: paymentGateway.providerName,
          gateway_order_id: gatewayOrder.gatewayOrderId,
          gateway_payment_id: null,
          gateway_key_id: gatewayOrder.keyId ?? null,
          // Persist the gateway amount so refunds and gateway events use the
          // same minor-unit representation as Razorpay.
          amount: gatewayOrder.amount,
          currency: order.currency,
          status: "initiated",
        });
      } catch (err) {
        // payments_active_order_unique: a concurrent initializePayment for
        // the same order inserted its row first. Adopt the winner's row
        // (and its gateway order) rather than racing it — two live rows
        // for one order is exactly what the index forbids.
        if (!isUniqueViolation(err)) throw err;
        const winner = await paymentRepo.findPaymentByOrderId(
          database,
          orderId,
        );
        if (!winner || !winner.gateway_order_id) {
          throw CommerceErrors.PAYMENT_NOT_FOUND(orderId);
        }
        if (winner.status === "captured") {
          throw CommerceErrors.PAYMENT_ALREADY_PROCESSED();
        }
        await recordPaymentAttempt(winner.id);
        return {
          gatewayOrder: {
            provider: toPaymentProvider(winner.gateway_provider),
            gatewayOrderId: winner.gateway_order_id,
            amount: winner.amount,
            currency: winner.currency,
            keyId: winner.gateway_key_id ?? undefined,
          },
        };
      }
    } else {
      // A payment row already existed (earlier abandoned/failed attempt, or
      // the amount/currency changed) and a fresh gateway order was created
      // above. Persist its id — conditionally: if a webhook captured the
      // old gateway order between our read and this write, stomping the row
      // back to "initiated" would orphan that captured money.
      const updated = await paymentRepo.reinitializePaymentIfNotFinal(
        database,
        payment.id,
        {
          gateway_order_id: gatewayOrder.gatewayOrderId,
          gateway_key_id: gatewayOrder.keyId ?? null,
          amount: gatewayOrder.amount,
          currency: order.currency,
        },
      );
      if (!updated) {
        throw CommerceErrors.PAYMENT_ALREADY_PROCESSED();
      }
      payment = updated;
    }

    await recordPaymentAttempt(payment.id);

    return {
      gatewayOrder: {
        provider: gatewayOrder.provider,
        gatewayOrderId: gatewayOrder.gatewayOrderId,
        amount: gatewayOrder.amount,
        currency: gatewayOrder.currency,
        keyId: gatewayOrder.keyId,
      },
    };
  }

  async function recordPaymentAttempt(paymentId: string): Promise<void> {
    const attemptCount = await paymentRepo.countPaymentAttempts(
      database,
      paymentId,
    );
    await paymentRepo.insertPaymentAttempt(database, {
      id: crypto.randomUUID(),
      payment_id: paymentId,
      gateway_payment_id: null,
      attempt_number: attemptCount + 1,
      status: "initiated",
    });
  }

  /**
   * Verifies client payment signature and transitions order to PAID and fulfills enrollments.
   * Delegates concurrency-safe fulfillment to the PaymentReconciliationService so that
   * concurrent calls from /payments/verify and the Razorpay webhook cannot double-fulfill.
   */
  async function verifyPayment(
    userId: string,
    input: VerifyPaymentRequest,
  ): Promise<VerifyPaymentResponse> {
    const { orderId, gatewayOrderId, gatewayPaymentId, gatewaySignature } =
      input;

    const order = await orderRepo.findOrderById(database, orderId);
    if (!order || order.user_id !== userId) {
      // Do not reveal whether the order exists for another user
      throw CommerceErrors.ORDER_NOT_FOUND(orderId);
    }

    const payment = await paymentRepo.findPaymentByGatewayOrderId(
      database,
      gatewayOrderId,
    );
    if (!payment || payment.order_id !== order.id) {
      throw CommerceErrors.PAYMENT_NOT_FOUND(gatewayOrderId);
    }

    // Idempotent short-circuit if already fully captured — safe to return early
    // without going to the gateway again (signature was already verified once).
    if (order.status === "paid" && payment.status === "captured") {
      return { verified: true, orderStatus: "paid" };
    }

    // 1. Verify signature via Gateway Abstraction
    const isValid = paymentGateway.verifyPaymentSignature({
      gatewayOrderId,
      gatewayPaymentId,
      gatewaySignature,
    });

    if (!isValid) {
      // Record the failed attempt outside a transaction — it is diagnostic only
      const attemptCount = await paymentRepo.countPaymentAttempts(
        database,
        payment.id,
      );
      await paymentRepo.insertPaymentAttempt(database, {
        id: crypto.randomUUID(),
        payment_id: payment.id,
        gateway_payment_id: gatewayPaymentId,
        attempt_number: attemptCount + 1,
        status: "failed",
        error_code: "SIGNATURE_VERIFICATION_FAILED",
        error_description: "Invalid payment signature.",
      });
      throw CommerceErrors.PAYMENT_SIGNATURE_INVALID();
    }

    // Allow a 15-minute grace period past expires_at for in-flight checkouts where
    // the user opened the gateway modal right before expiry and completed payment.
    const GRACE_PERIOD_MS = 15 * 60 * 1000;
    const isOrderPastGracePeriod =
      new Date(order.expires_at).getTime() + GRACE_PERIOD_MS < Date.now();

    if (isOrderPastGracePeriod) {
      throw CommerceErrors.ORDER_EXPIRED();
    }

    // 2. Fetch authoritative payment status from Gateway (OUTSIDE transaction)
    const paymentDetails = await paymentGateway
      .getPayment(gatewayPaymentId)
      .catch((err: unknown) => {
        throw toClientGatewayError(err);
      });

    // Verify payment belongs to this gateway order
    if (paymentDetails.gatewayOrderId !== gatewayOrderId) {
      throw CommerceErrors.PAYMENT_NOT_FOUND(gatewayOrderId);
    }

    const expectedGatewayAmount = toGatewayAmount(
      order.total_amount,
      order.currency,
    );
    if (paymentDetails.amount !== expectedGatewayAmount) {
      throw CommerceErrors.PAYMENT_AMOUNT_MISMATCH();
    }
    if (
      paymentDetails.currency.toUpperCase() !== order.currency.toUpperCase()
    ) {
      throw CommerceErrors.PAYMENT_CURRENCY_MISMATCH();
    }

    // Explicitly require captured status (authorized is not sufficient)
    if (paymentDetails.status !== "captured") {
      throw CommerceErrors.PAYMENT_NOT_CAPTURED();
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

    return { verified: true, orderStatus: "paid" };
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
  };
}
