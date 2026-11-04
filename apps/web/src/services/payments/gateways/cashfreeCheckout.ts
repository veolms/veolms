import type {
  GatewayCheckoutCallbacks,
  GatewayCheckoutRequest,
  StopGatewayCheckout,
} from "./gatewayCheckout";

/** Cashfree's checkout script (v3); it starts sandbox or production. */
const SCRIPT_URL = "https://sdk.cashfree.com/js/v3/cashfree.js";

export const CASHFREE_CHECKOUT_BLOCKED_MESSAGE =
  "The payment window couldn't open. Nothing was charged. Check your connection and try again, or contact us and we'll help you enrol.";

interface CashfreeCheckoutResult {
  error?: { message?: string; code?: string; type?: string };
  redirect?: boolean;
  paymentDetails?: { paymentMessage?: string };
}

interface CashfreeSdk {
  checkout(options: {
    paymentSessionId: string;
    redirectTarget: "_modal";
  }): Promise<CashfreeCheckoutResult>;
}

declare global {
  interface Window {
    Cashfree?: (options: { mode: "sandbox" | "production" }) => CashfreeSdk;
  }
}

let sdkLoad: Promise<NonNullable<Window["Cashfree"]>> | null = null;

function loadSdk(): Promise<NonNullable<Window["Cashfree"]>> {
  sdkLoad ??= new Promise<NonNullable<Window["Cashfree"]>>(
    (resolve, reject) => {
      if (window.Cashfree) return resolve(window.Cashfree);
      const script = document.createElement("script");
      script.src = SCRIPT_URL;
      script.async = true;
      script.onload = () => {
        if (window.Cashfree) resolve(window.Cashfree);
        else reject(new Error("Payment checkout is unavailable."));
      };
      script.onerror = () => {
        script.remove();
        reject(new Error("Unable to load payment checkout."));
      };
      document.head.appendChild(script);
    },
  ).catch((error: unknown) => {
    sdkLoad = null;
    throw error;
  });
  return sdkLoad;
}

/**
 * The server hands a Cashfree order out with its payment session in
 * `keyId`, as `<environment>:<session id>`.
 */
function paymentSession(keyId: string | undefined) {
  const at = keyId?.indexOf(":") ?? -1;
  if (!keyId || at <= 0) return undefined;
  const mode = keyId.slice(0, at);
  if (mode !== "sandbox" && mode !== "production") return undefined;
  return { mode, paymentSessionId: keyId.slice(at + 1) } as const;
}

/**
 * Cashfree's window, over the page. It settles once: with the payment's
 * details when the buyer paid (or a payment ended, which the server tells
 * apart), with an error when they closed it or it could not open, or with
 * a redirect when the payment finishes on another page (a bank's), from
 * which the buyer comes back to their purchase history.
 */
export async function openCashfreeCheckout(
  { gateway }: GatewayCheckoutRequest,
  callbacks: GatewayCheckoutCallbacks,
): Promise<StopGatewayCheckout> {
  const session = paymentSession(gateway.keyId);
  if (!session) throw new Error("Payment checkout is unavailable.");

  const Cashfree = await loadSdk();
  let ended = false;

  void Cashfree({ mode: session.mode })
    .checkout({
      paymentSessionId: session.paymentSessionId,
      redirectTarget: "_modal",
    })
    .then(
      (result) => {
        if (ended || result.redirect) return;
        ended = true;
        if (result.paymentDetails) {
          callbacks.onPaid({ gatewayOrderId: gateway.gatewayOrderId });
        } else {
          // Closed, or a payment that failed: the server keeps the order
          // if a payment for it is still under way.
          callbacks.onDismissed();
        }
      },
      () => {
        if (ended) return;
        ended = true;
        callbacks.onBlocked(CASHFREE_CHECKOUT_BLOCKED_MESSAGE);
      },
    );

  return () => {
    ended = true;
  };
}
