import type { ServerConfig } from "@veolms/config";
import type { PaymentGateway } from "@veolms/contracts";
import { RazorpayPaymentGateway } from "./razorpay/razorpay.gateway.ts";

/**
 * Creates the active payment gateway based on configuration.
 * Allows effortless substitution of providers (Razorpay, Stripe, Mock) in future.
 *
 * `loadServerConfig` (see @veolms/config) already refuses to boot in
 * production when RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET/RAZORPAY_WEBHOOK_SECRET
 * are unset, so the production throw below is defense in depth only. In
 * development/test the credentials stay optional so the rest of the app can
 * run without a Razorpay account configured — but we never substitute a
 * placeholder key that *looks* configured. An empty key fails loudly and
 * immediately at the gateway instead of silently sending bogus credentials
 * to Razorpay's API.
 */
export function createPaymentGateway(config: ServerConfig): PaymentGateway {
  if (!config.RAZORPAY_KEY_ID || !config.RAZORPAY_KEY_SECRET) {
    if (config.NODE_ENV === "production") {
      throw new Error(
        "RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required in production.",
      );
    }
    // eslint-disable-next-line no-console
    console.warn(
      "[commerce] RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set — the payment " +
        "gateway is unconfigured. Checkout and payment endpoints will fail until they are set.",
    );
  }

  if (!config.RAZORPAY_WEBHOOK_SECRET && config.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.warn(
      "[commerce] RAZORPAY_WEBHOOK_SECRET is not set — all incoming Razorpay " +
        "webhooks will be rejected as invalid until it is set.",
    );
  }

  return new RazorpayPaymentGateway({
    keyId: config.RAZORPAY_KEY_ID ?? "",
    keySecret: config.RAZORPAY_KEY_SECRET ?? "",
    webhookSecret: config.RAZORPAY_WEBHOOK_SECRET,
  });
}
