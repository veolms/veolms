import type { Json } from "@veolms/database";
import type { PaymentGateway } from "@veolms/contracts";

/** What of a payment row is needed to ask the gateway about it. */
export interface GatewayPaymentRef {
  gateway_order_id: string;
  gateway_payment_id: string | null;
  payment_method: Json | null;
}

/**
 * What the gateway says about the order behind one of our payments.
 *
 * - `unpaid`: nothing has been captured for it (yet).
 * - `paid-unidentified`: the gateway reports the order paid, but no captured
 *   payment could be named for it; the webhook is left to settle it.
 * - `captured`: the money was taken, by the payment named.
 */
export type GatewayCapture =
  | { state: "unpaid" }
  | { state: "paid-unidentified" }
  | {
      state: "captured";
      gatewayPaymentId: string;
      paymentMethod: Json | null;
    };

/**
 * Asks the gateway whether the money for one of our payments was captured.
 *
 * A payment can be captured without our hearing of it: the browser's
 * confirmation call and the webhook can both be lost (the buyer's checkout
 * window closing without calling back is enough for the first). The recovery
 * worker asks on a schedule; the checkout asks before it hands an unpaid
 * order's gateway order out again, because the gateway refuses to open a
 * checkout for an order it has already been paid for.
 */
export async function findGatewayCapture(
  paymentGateway: PaymentGateway,
  payment: GatewayPaymentRef,
): Promise<GatewayCapture> {
  const gatewayOrder = await paymentGateway.fetchOrder(
    payment.gateway_order_id,
  );
  if (gatewayOrder.status !== "paid") return { state: "unpaid" };

  if (payment.gateway_payment_id) {
    return {
      state: "captured",
      gatewayPaymentId: payment.gateway_payment_id,
      paymentMethod: payment.payment_method,
    };
  }

  // No gateway payment id locally: ask which payment on the order was
  // captured.
  const orderPayments = await paymentGateway.fetchOrderPayments(
    payment.gateway_order_id,
  );
  const capturedPayment = orderPayments.find((p) => p.status === "captured");
  if (!capturedPayment) return { state: "paid-unidentified" };

  return {
    state: "captured",
    gatewayPaymentId: capturedPayment.gatewayPaymentId,
    paymentMethod: capturedPayment.method
      ? {
          method: capturedPayment.method,
          bank: capturedPayment.bank,
          wallet: capturedPayment.wallet,
          vpa: capturedPayment.vpa,
          cardLast4: capturedPayment.cardLast4,
        }
      : payment.payment_method,
  };
}

/**
 * Whether no payment for a gateway order can still be taken: none was
 * started, or every one that was failed. A payment the buyer started and has
 * not finished (a UPI request waiting in their app, a card waiting on the
 * bank, an authorised payment not yet captured) is `processing` here and may
 * still be captured.
 */
export async function gatewayOrderHasNoLivePayment(
  paymentGateway: PaymentGateway,
  gatewayOrderId: string,
): Promise<boolean> {
  const gatewayOrder = await paymentGateway.fetchOrder(gatewayOrderId);
  if (gatewayOrder.status === "created") return true;
  if (gatewayOrder.status === "paid") return false;
  const payments = await paymentGateway.fetchOrderPayments(gatewayOrderId);
  return payments.every((payment) => payment.status === "failed");
}
