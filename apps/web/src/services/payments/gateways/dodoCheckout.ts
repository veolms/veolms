import { CHECKOUT_WINDOW_SECONDS } from "@veolms/contracts";
import type {
  GatewayCheckoutCallbacks,
  GatewayCheckoutRequest,
  StopGatewayCheckout,
} from "./gatewayCheckout";

/**
 * Dodo Payments' overlay script, pinned. It puts the session's hosted
 * checkout in a frame over the page and reports what happens in it.
 */
const SCRIPT_URL =
  "https://cdn.jsdelivr.net/npm/dodopayments-checkout@2.0.0/dist/index.js";

/** How long the checkout may take to come up before it is given up on. */
const LOAD_TIMEOUT_MS = 20_000;

export const DODO_CHECKOUT_BLOCKED_MESSAGE =
  "The payment window couldn't open. Nothing was charged. Check your connection and try again, or contact us and we'll help you enrol.";

interface DodoCheckoutEvent {
  event_type: string;
  data?: Record<string, unknown>;
}

interface DodoCheckoutSdk {
  Initialize(config: {
    mode: "test" | "live";
    displayType: "overlay";
    onEvent: (event: DodoCheckoutEvent) => void;
  }): void;
  Checkout: {
    open(options: {
      checkoutUrl: string;
      options?: { manualRedirect?: boolean; showTimer?: boolean };
    }): void;
    close(): void;
  };
}

declare global {
  interface Window {
    DodoPaymentsCheckout?: { DodoPayments: DodoCheckoutSdk };
  }
}

let sdkLoad: Promise<DodoCheckoutSdk> | null = null;
let initializedMode: "test" | "live" | null = null;
/** Where the open checkout's events go; the script takes one listener. */
let listener: ((event: DodoCheckoutEvent) => void) | null = null;

function loadSdk(): Promise<DodoCheckoutSdk> {
  sdkLoad ??= new Promise<DodoCheckoutSdk>((resolve, reject) => {
    const loaded = window.DodoPaymentsCheckout?.DodoPayments;
    if (loaded) return resolve(loaded);
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      const sdk = window.DodoPaymentsCheckout?.DodoPayments;
      if (sdk) resolve(sdk);
      else reject(new Error("Payment checkout is unavailable."));
    };
    script.onerror = () => {
      script.remove();
      reject(new Error("Unable to load payment checkout."));
    };
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    sdkLoad = null;
    throw error;
  });
  return sdkLoad;
}

/**
 * A field of an event, which the checkout puts under `data.message`
 * (`data` itself in some versions).
 */
function eventField(event: DodoCheckoutEvent, field: string): unknown {
  const message = event.data?.message;
  if (message && typeof message === "object" && field in message) {
    return (message as Record<string, unknown>)[field];
  }
  return event.data?.[field];
}

/**
 * Dodo Payments' hosted checkout, over the page.
 *
 * Redirects are left to this page (`manualRedirect`): a successful payment
 * is reported here and confirmed with the server without leaving the page,
 * and only a payment that must finish elsewhere (a bank's own page) takes
 * the buyer away; they come back to their purchase history, where the order
 * shows once the payment is confirmed.
 *
 * Dodo keeps a checkout session payable for a day. Like Razorpay's window,
 * this one is closed after CHECKOUT_WINDOW_SECONDS, the time the server
 * keeps a buyer from starting another payment for the same purchase.
 */
export async function openDodoCheckout(
  { gateway }: GatewayCheckoutRequest,
  callbacks: GatewayCheckoutCallbacks,
): Promise<StopGatewayCheckout> {
  const checkoutUrl = gateway.checkoutUrl;
  if (!checkoutUrl) throw new Error("Payment checkout is unavailable.");
  const mode = new URL(checkoutUrl).hostname.startsWith("test.")
    ? "test"
    : "live";

  const sdk = await loadSdk();
  if (initializedMode !== mode) {
    sdk.Initialize({
      mode,
      displayType: "overlay",
      onEvent: (event) => listener?.(event),
    });
    initializedMode = mode;
  }

  let ended = false;
  let shown = false;
  const end = () => {
    ended = true;
    if (listener === onEvent) listener = null;
    window.clearTimeout(loadTimer);
    window.clearTimeout(closeTimer);
  };

  function onEvent(event: DodoCheckoutEvent) {
    if (ended) return;
    switch (event.event_type) {
      case "checkout.opened":
      case "checkout.form_ready":
        shown = true;
        window.clearTimeout(loadTimer);
        return;
      case "checkout.status": {
        // A declined payment is shown in the checkout, which lets the buyer
        // try again; only a payment that went through ends it here.
        if (eventField(event, "status") !== "succeeded") return;
        end();
        sdk.Checkout.close();
        const paymentId = eventField(event, "payment_id");
        callbacks.onPaid({
          gatewayOrderId: gateway.gatewayOrderId,
          ...(typeof paymentId === "string" && paymentId
            ? { gatewayPaymentId: paymentId }
            : {}),
        });
        return;
      }
      case "checkout.redirect_requested": {
        const url = eventField(event, "redirect_to");
        if (typeof url === "string" && /^https:\/\//u.test(url)) {
          end();
          window.location.assign(url);
        }
        return;
      }
      case "checkout.error":
        // Before the checkout came up, nothing can have been paid in it.
        if (shown) return;
        end();
        sdk.Checkout.close();
        callbacks.onBlocked(DODO_CHECKOUT_BLOCKED_MESSAGE);
        return;
      case "checkout.closed":
      case "checkout.link_expired":
        end();
        callbacks.onDismissed();
        return;
    }
  }

  listener = onEvent;
  sdk.Checkout.open({ checkoutUrl, options: { manualRedirect: true } });

  const loadTimer = window.setTimeout(() => {
    if (shown || ended) return;
    end();
    sdk.Checkout.close();
    callbacks.onBlocked(DODO_CHECKOUT_BLOCKED_MESSAGE);
  }, LOAD_TIMEOUT_MS);
  // Answered as the buyer closing it: the server keeps the order if a
  // payment for it is under way.
  const closeTimer = window.setTimeout(() => {
    if (ended) return;
    end();
    sdk.Checkout.close();
    callbacks.onDismissed();
  }, CHECKOUT_WINDOW_SECONDS * 1000);

  return end;
}
