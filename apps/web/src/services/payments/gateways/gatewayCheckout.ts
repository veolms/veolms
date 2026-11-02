import type {
  CreateCheckoutOrderResponse,
  VerifyPaymentRequest,
} from "@veolms/contracts";

/** The gateway an order is to be paid through, as the server handed it out. */
export type CheckoutGateway = NonNullable<
  CreateCheckoutOrderResponse["gateway"]
>;

export interface GatewayCheckoutRequest {
  gateway: CheckoutGateway;
  /** What the window is headed with: the academy's name. */
  name: string;
  /** What is being paid for. */
  description: string;
  prefill: { name?: string; email?: string | null };
}

/**
 * How a payment window ended. Exactly one is called, once, unless the page
 * stops watching first.
 */
export interface GatewayCheckoutCallbacks {
  /** The window reports a payment made; `proof` goes to /payments/verify. */
  onPaid(proof: Omit<VerifyPaymentRequest, "orderId">): void;
  /** The buyer closed the window without paying. */
  onDismissed(): void;
  /** The window never came up, so nothing can have been paid in it. */
  onBlocked(message: string): void;
  /**
   * The window went away without saying how it ended, so a payment may have
   * been taken. Without this, such a close is not watched for.
   */
  onClosedUnanswered?(): void;
}

/** Stops watching an open window, when the page goes away. */
export type StopGatewayCheckout = () => void;

/**
 * Opens the payment window of the gateway the server chose for this order
 * (by the buyer's country): Razorpay's or Cashfree's own window, or Dodo
 * Payments' hosted checkout over the page. Throws when the gateway's script cannot be loaded,
 * before anything is shown.
 *
 * Each gateway's code (and Razorpay's stylesheet) is fetched here, on the
 * way to paying, and not with the pages that offer a purchase.
 */
export async function openGatewayCheckout(
  request: GatewayCheckoutRequest,
  callbacks: GatewayCheckoutCallbacks,
): Promise<StopGatewayCheckout> {
  // An API from before gateways were chosen by country names none, and
  // all its checkouts were Razorpay's (this page can be served first).
  switch ((request.gateway.provider as string | undefined) ?? "razorpay") {
    case "dodo": {
      const { openDodoCheckout } = await import("./dodoCheckout");
      return await openDodoCheckout(request, callbacks);
    }
    case "cashfree": {
      const { openCashfreeCheckout } = await import("./cashfreeCheckout");
      return await openCashfreeCheckout(request, callbacks);
    }
    case "razorpay": {
      const { openRazorpayCheckout } = await import("./razorpayCheckout");
      return await openRazorpayCheckout(request, callbacks);
    }
    default:
      throw new Error("Payment checkout is unavailable.");
  }
}
