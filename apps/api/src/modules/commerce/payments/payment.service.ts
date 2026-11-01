import crypto from "node:crypto";
import type {
  PaymentGateways,
  PaymentProvider,
  VerifyPaymentRequest,
  VerifyPaymentResponse,
} from "@veolms/contracts";
import type { Database, DatabaseExecutor as Executor } from "@veolms/database";
import type { FastifyBaseLogger } from "fastify";
import type { Kysely } from "kysely";
import {
  CommerceErrors,
  toClientGatewayError,
} from "../shared/commerce.errors.ts";
import { isUniqueViolation } from "../shared/db-errors.ts";
import {
  CHECKOUT_HAND_OUT_ATTEMPT_STATUS,
  isOrderOpen,
  manualPaymentBlockingSince,
} from "../shared/open-orders.ts";
import * as paymentRepo from "./payment.repository.ts";
import * as manualPaymentRepo from "./manual-payment.repository.ts";
import * as orderRepo from "../orders/order.repository.ts";
import { createPaymentReconciliationService } from "./payment-reconciliation.service.ts";
import { createExtraPaymentRefundService } from "./extra-payment-refund.service.ts";
import { config } from "../../../config.ts";
import { toPaymentProvider } from "./payment.mapper.ts";
import { reportDuplicatePurchases } from "./duplicate-purchase.ts";
import { findGatewayCapture } from "./captured-gateway-payment.ts";

/**
 * What the gateway is asked to charge for an order. Order totals are stored
 * in the currency's smallest unit (49900 paise for ₹499), which is what
 * gateways take, so this is the stored total. Shared with the refund paths
 * so full/partial comparisons use one definition.
 */
function toGatewayAmount(amountMinor: number, _currency: string): number {
  return amountMinor;
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
     * The order row, when the caller has only just written it. Saves one
     * read; it is read again before anything is handed out.
     */
    order?: PaymentOrderRow;
    customer: {
      id: string;
      name: string;
      email?: string | null;
      phone?: string | null;
    };
    /**
     * The buyer's country (ISO 3166-1 alpha-2), when known: it picks the
     * gateway of an order's first payment (see PaymentGateways.forCountry).
     */
    country?: string | null;
  }): Promise<{
    gatewayOrder: {
      provider: PaymentProvider;
      gatewayOrderId: string;
      amount: number;
      currency: string;
      keyId?: string;
      checkoutUrl?: string;
    };
  }>;
  /**
   * Notes that a payment's gateway order was returned to the buyer again
   * without going through initializePayment, so the time it was last handed
   * out stays true (see shared/open-orders.ts). `executor` is the
   * transaction holding the buyer's checkout lock, when the hand-out is
   * decided under it.
   */
  recordCheckoutHandOut(paymentId: string, executor?: Executor): Promise<void>;
  verifyPayment(
    userId: string,
    input: VerifyPaymentRequest,
  ): Promise<VerifyPaymentResponse>;
}

export interface PaymentServiceOptions {
  database: Kysely<Database>;
  paymentGateways: PaymentGateways;
  /** Where a duplicate purchase found on verification is reported. */
  logger?: FastifyBaseLogger;
  /** See `AUTO_REFUND_EXTRA_PAYMENTS`. */
  autoRefundExtraPayments?: boolean;
  /** See `MANUAL_PAYMENT_BLOCK_DAYS`. */
  manualPaymentBlockDays?: number;
}

export function createPaymentService({
  database,
  paymentGateways,
  logger,
  autoRefundExtraPayments = config.AUTO_REFUND_EXTRA_PAYMENTS,
  manualPaymentBlockDays = config.MANUAL_PAYMENT_BLOCK_DAYS,
}: PaymentServiceOptions): PaymentService {
  const reconciliation = createPaymentReconciliationService({
    database,
    autoRefundExtraPayments,
  });
  const extraPaymentRefunds = createExtraPaymentRefundService({
    database,
    paymentGateways,
    logger,
  });
  /**
   * Initializes a payment for an internal pending order through the gateway
   * for the buyer's country, or the one its payment was started with.
   */
  async function initializePayment({
    orderId,
    order: knownOrder,
    customer,
    country,
  }: {
    orderId: string;
    order?: PaymentOrderRow;
    customer: {
      id: string;
      name: string;
      email?: string | null;
      phone?: string | null;
    };
    country?: string | null;
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
    // A transfer the buyer reported for this order is with staff. Paying
    // through the gateway as well would pay for it twice. An order written
    // a moment ago cannot have one. One that staff have left unanswered
    // for MANUAL_PAYMENT_BLOCK_DAYS no longer stands in the way.
    if (
      !knownOrder &&
      (await manualPaymentRepo.findPendingManualPaymentRequestByOrderId(
        database,
        orderId,
        manualPaymentBlockingSince(new Date(), manualPaymentBlockDays),
      ))
    ) {
      const items = await orderRepo.listOrderItems(database, orderId);
      throw CommerceErrors.MANUAL_PAYMENT_PENDING(
        items.map((item) => item.title_snapshot).join(", "),
      );
    }

    // 1. Check if a payment record already exists for this order
    const payment = await paymentRepo.findPaymentByOrderId(database, orderId);

    if (payment && payment.status === "captured") {
      throw CommerceErrors.PAYMENT_ALREADY_PROCESSED();
    }

    const gatewayAmount = toGatewayAmount(order.total_amount, order.currency);

    // A payment keeps the gateway it was started with: the gateway order it
    // has there may still be paid, which only that gateway would tell us.
    // An order's first payment goes to the gateway for the buyer's country.
    const paymentGateway =
      (payment && paymentGateways.get(payment.gateway_provider)) ??
      paymentGateways.forCountry(country);

    // 2. Reuse an in-flight gateway order when nothing changed. Every
    //    re-initialization used to create a FRESH gateway order and
    //    overwrite gateway_order_id — but the old gateway order stays
    //    payable at the provider, so a user paying it (second tab, slow
    //    checkout page, double click) produced captured money attached to
    //    a gateway order id no payment row references anymore.
    const isReusable = (row: NonNullable<typeof payment>) =>
      (row.status === "initiated" || row.status === "processing") &&
      row.gateway_order_id !== null &&
      row.amount === gatewayAmount &&
      row.currency === order.currency &&
      row.gateway_provider === paymentGateway.providerName;

    /**
     * Hands a gateway order out, and writes the payment row for a `fresh`
     * one, only while the order can still be paid. Under the buyer's
     * checkout lock, so a checkout that closes this order to make another
     * (see checkout.service.ts) either runs first, and nothing is handed
     * out for the closed order, or runs after and finds this one in
     * checkout. The order was read before the gateway was asked, which can
     * take long enough for it to be closed or cancelled in between; a
     * gateway order returned for it then could be paid with nothing to
     * fulfil.
     *
     * A row that can be reused is handed out as it is and `fresh` is left
     * unused (another request wrote it first). Without `fresh`, returns
     * undefined when there is no such row.
     */
    const handOut = (fresh?: {
      provider: PaymentProvider;
      gatewayOrderId: string;
      amount: number;
      currency: string;
      keyId?: string;
      checkoutUrl?: string;
    }) =>
      database.transaction().execute(async (trx) => {
        await orderRepo.lockBuyerCheckout(trx, order.user_id);
        const current = await orderRepo.findOrderByIdForUpdate(trx, orderId);
        if (current?.status === "paid") {
          throw CommerceErrors.ORDER_ALREADY_PAID();
        }
        if (!current || !isOrderOpen(current, new Date())) {
          throw CommerceErrors.ORDER_EXPIRED();
        }

        const row = await paymentRepo.findPaymentByOrderId(trx, orderId);
        if (row?.status === "captured") {
          throw CommerceErrors.PAYMENT_ALREADY_PROCESSED();
        }
        if (row && isReusable(row)) {
          await recordPaymentAttempt(row.id, trx);
          return {
            gatewayOrder: {
              provider: toPaymentProvider(row.gateway_provider),
              gatewayOrderId: row.gateway_order_id,
              amount: row.amount,
              currency: row.currency,
              keyId: row.gateway_key_id ?? undefined,
              checkoutUrl: paymentGateway.checkoutUrl(row.gateway_order_id),
            },
          };
        }
        if (!fresh) return undefined;

        // A row that cannot be reused (an earlier failed attempt, or the
        // amount changed) is pointed at the fresh gateway order —
        // conditionally: if a webhook captured the old gateway order
        // meanwhile, stomping the row back to "initiated" would orphan that
        // captured money.
        const written = row
          ? await paymentRepo.reinitializePaymentIfNotFinal(trx, row.id, {
              // The same gateway as before, unless that one is no longer
              // set up (see paymentGateway above).
              gateway_provider: fresh.provider,
              gateway_order_id: fresh.gatewayOrderId,
              gateway_key_id: fresh.keyId ?? null,
              amount: fresh.amount,
              currency: order.currency,
            })
          : await paymentRepo.insertPayment(trx, {
              id: crypto.randomUUID(),
              order_id: order.id,
              gateway_provider: paymentGateway.providerName,
              gateway_order_id: fresh.gatewayOrderId,
              gateway_payment_id: null,
              gateway_key_id: fresh.keyId ?? null,
              // Persist the gateway amount so refunds and gateway events use
              // the same minor-unit representation as Razorpay.
              amount: fresh.amount,
              currency: order.currency,
              status: "initiated",
            });
        if (!written) {
          throw CommerceErrors.PAYMENT_ALREADY_PROCESSED();
        }
        await recordPaymentAttempt(written.id, trx);
        return { gatewayOrder: fresh };
      });

    if (payment && isReusable(payment)) {
      const reused = await handOut();
      if (reused) return reused;
    }

    // 3. Create upstream order via the gateway abstraction (Razorpay, Dodo Payments).
    // The gateway receives minor units, as the order total is stored.
    const items = await orderRepo.listOrderItems(database, order.id);
    const gatewayOrder = await paymentGateway
      .createOrder({
        orderId: order.id,
        orderNumber: order.order_number,
        amount: gatewayAmount,
        currency: order.currency,
        receipt: order.order_number,
        customer,
        description: items.map((item) => item.title_snapshot).join(", "),
        notes: {
          orderId: order.id,
          userId: order.user_id,
        },
      })
      .catch((err: unknown) => {
        throw toClientGatewayError(err);
      });

    const fresh = {
      provider: gatewayOrder.provider,
      gatewayOrderId: gatewayOrder.gatewayOrderId,
      amount: gatewayOrder.amount,
      currency: gatewayOrder.currency,
      keyId: gatewayOrder.keyId,
      checkoutUrl: gatewayOrder.checkoutUrl,
    };
    const handedOut = await handOut(fresh).catch((err: unknown) => {
      // payments_active_order_unique: a live row for this order was written
      // by something that does not take the buyer's lock. Trying again
      // finds that row and hands it out instead.
      if (!isUniqueViolation(err)) throw err;
      return handOut(fresh);
    });
    if (!handedOut) {
      throw CommerceErrors.PAYMENT_NOT_FOUND(orderId);
    }
    return handedOut;
  }

  async function recordPaymentAttempt(
    paymentId: string,
    executor: Executor = database,
  ): Promise<void> {
    const attemptCount = await paymentRepo.countPaymentAttempts(
      executor,
      paymentId,
    );
    await paymentRepo.insertPaymentAttempt(executor, {
      id: crypto.randomUUID(),
      payment_id: paymentId,
      gateway_payment_id: null,
      attempt_number: attemptCount + 1,
      status: CHECKOUT_HAND_OUT_ATTEMPT_STATUS,
    });
  }

  /**
   * Verifies what the payment widget reported and transitions order to PAID and fulfills enrollments.
   * Delegates concurrency-safe fulfillment to the PaymentReconciliationService so that
   * concurrent calls from /payments/verify and the gateway webhook cannot double-fulfill.
   */
  async function verifyPayment(
    userId: string,
    input: VerifyPaymentRequest,
  ): Promise<VerifyPaymentResponse> {
    const { orderId, gatewayOrderId, gatewaySignature } = input;

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

    // The gateway the payment was made with.
    const paymentGateway = paymentGateways.get(payment.gateway_provider);
    if (!paymentGateway) {
      throw CommerceErrors.PAYMENT_NOT_FOUND(gatewayOrderId);
    }

    // 1. Find the payment. A hosted checkout (Dodo Payments) does not
    //    always tell the page which payment was made: the gateway is asked,
    //    as the recovery cycle would ask it, which payment of this gateway
    //    order was captured.
    let gatewayPaymentId = input.gatewayPaymentId;
    if (!gatewayPaymentId) {
      const capture = await findGatewayCapture(paymentGateway, payment).catch(
        (err: unknown) => {
          throw toClientGatewayError(err);
        },
      );
      if (capture.state !== "captured") {
        throw CommerceErrors.PAYMENT_NOT_CAPTURED();
      }
      gatewayPaymentId = capture.gatewayPaymentId;
    }

    //    A payment the page named is only taken with its signature, from a
    //    gateway whose widget signs what it reports.
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
    const result = await reconciliation.finalizeSuccessfulPayment({
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
    // A payment in another currency: what it settles for, for the revenue
    // reports. Whichever path saw the capture first records it.
    if (
      (result.outcome === "finalized" ||
        result.outcome === "already_captured") &&
      typeof paymentDetails.settlementAmount === "number" &&
      paymentDetails.settlementCurrency
    ) {
      await orderRepo.recordOrderSettlement(database, order.id, {
        amount: paymentDetails.settlementAmount,
        currency: paymentDetails.settlementCurrency,
      });
    }

    if (
      result.outcome === "recorded_as_surplus" ||
      result.outcome === "recorded_as_extra"
    ) {
      // Extra money: the order was already paid, or the buyer already has
      // what it sells. Nothing was granted for it. It goes back to the
      // buyer when automatic refunds are on, and is on the staff list until
      // it has.
      if (result.autoRefundReserved) {
        await extraPaymentRefunds.refundExtraPayment(payment.id);
      }
      if (result.outcome === "recorded_as_extra") {
        const closed = await orderRepo.findOrderById(database, order.id);
        return { verified: true, orderStatus: closed?.status ?? "expired" };
      }
    }

    if (result.outcome === "finalized") {
      // This payment may be for an order the buyer had already replaced and
      // paid again (see duplicate-purchase.ts). The buyer's answer is the
      // same either way; staff are told, and refund one of the two.
      await reportDuplicatePurchases({
        database,
        log: logger?.child({ job: "payment-verify" }),
        order: { id: order.id, userId: order.user_id },
        payment: {
          id: payment.id,
          gatewayPaymentId,
          amount: payment.amount,
          currency: payment.currency,
        },
      });
    }

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
    recordCheckoutHandOut: recordPaymentAttempt,
    verifyPayment,
  };
}
