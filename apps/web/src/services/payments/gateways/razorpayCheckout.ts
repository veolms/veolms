import { CHECKOUT_WINDOW_SECONDS } from "@veolms/contracts";
import {
  CHECKOUT_WINDOW_BLOCKED_MESSAGE,
  openCheckoutWindow,
} from "../checkoutWindowLoad";
import "../razorpay-checkout.css";
import type {
  GatewayCheckoutCallbacks,
  GatewayCheckoutRequest,
  StopGatewayCheckout,
} from "./gatewayCheckout";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      close?: () => void;
    };
  }
}

const SCRIPT_URL = "https://checkout.razorpay.com/v1/checkout.js";

async function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return;
  // A script tag left by an earlier attempt that has not finished loading.
  const pending = document.querySelector<HTMLScriptElement>(
    `script[src="${SCRIPT_URL}"]`,
  );
  await new Promise<void>((resolve, reject) => {
    const script = pending ?? document.createElement("script");
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error("Unable to load payment checkout.")),
      { once: true },
    );
    if (!pending) {
      script.src = SCRIPT_URL;
      document.head.appendChild(script);
    }
  });
}

/**
 * Razorpay's window, opened with the order's id and key.
 *
 * Two ways it can end without telling the page are watched for. Its
 * servers refusing the visitor (see checkoutWindowLoad.ts): the window never
 * comes up. And its own error screens: it can close from one of them ("Uh!
 * oh! Something went wrong") calling neither its success handler nor
 * `ondismiss`, possibly after the card was charged, so while it is open the
 * page watches it, and a close nobody answered is reported as such.
 */
export async function openRazorpayCheckout(
  { gateway, name, description, prefill }: GatewayCheckoutRequest,
  callbacks: GatewayCheckoutCallbacks,
): Promise<StopGatewayCheckout> {
  await loadRazorpay();
  if (!window.Razorpay) {
    throw new Error("Payment checkout is unavailable.");
  }

  // Whether the window has told the page how it ended.
  let answered = false;
  // The gateway refused to load its window here; its own close then says
  // nothing more.
  let windowBlocked = false;
  let closeWatch: number | null = null;
  const stopCloseWatch = () => {
    if (closeWatch !== null) window.clearInterval(closeWatch);
    closeWatch = null;
  };

  const rzp = new window.Razorpay({
    key: gateway.keyId,
    amount: gateway.amount,
    currency: gateway.currency,
    name,
    description,
    order_id: gateway.gatewayOrderId,
    // The window closes itself, so a payment cannot be completed in it
    // long after the server has let the buyer start another one.
    timeout: CHECKOUT_WINDOW_SECONDS,
    prefill,
    handler: (response: {
      razorpay_order_id: string;
      razorpay_payment_id: string;
      razorpay_signature: string;
    }) => {
      answered = true;
      callbacks.onPaid({
        gatewayOrderId: response.razorpay_order_id,
        gatewayPaymentId: response.razorpay_payment_id,
        gatewaySignature: response.razorpay_signature,
      });
    },
    modal: {
      ondismiss: () => {
        answered = true;
        if (windowBlocked) return;
        callbacks.onDismissed();
      },
    },
  });

  // Opens the window. If it never comes up, nothing can have been paid in
  // it.
  const stopLoadWatch = openCheckoutWindow(rzp, () => {
    windowBlocked = true;
    answered = true;
    stopCloseWatch();
    callbacks.onBlocked(CHECKOUT_WINDOW_BLOCKED_MESSAGE);
  });

  if (callbacks.onClosedUnanswered) {
    const onClosedUnanswered = callbacks.onClosedUnanswered;
    let seenOpen = false;
    closeWatch = window.setInterval(() => {
      if (answered) return stopCloseWatch();
      const container = document.querySelector(".razorpay-container");
      const isOpen =
        container !== null &&
        window.getComputedStyle(container).display !== "none";
      if (isOpen) {
        seenOpen = true;
        return;
      }
      if (!seenOpen) return;
      stopCloseWatch();
      onClosedUnanswered();
    }, 500);
  }

  return () => {
    stopLoadWatch();
    stopCloseWatch();
  };
}
