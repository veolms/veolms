import type { PaymentGatewayPlugin } from "../gateway-plugin.ts";
import { RazorpayPaymentGateway } from "./razorpay.gateway.ts";

export * from "./razorpay.gateway.ts";

/**
 * Razorpay, for buyers in India (UPI, Indian cards, net banking). Always
 * set up: production refuses to start without its keys (see
 * packages/config), and elsewhere it is created without them so that a paid
 * checkout fails with "not configured" rather than the API not starting.
 */
export const razorpayGatewayPlugin: PaymentGatewayPlugin = {
  provider: "razorpay",
  create(config) {
    if (!config.RAZORPAY_KEY_ID || !config.RAZORPAY_KEY_SECRET) {
      if (config.NODE_ENV === "production") {
        throw new Error(
          "RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required in production.",
        );
      }
      console.warn(
        "[commerce] RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set — the payment " +
          "gateway is unconfigured. Checkout and payment endpoints will fail until they are set.",
      );
    }

    if (!config.RAZORPAY_WEBHOOK_SECRET && config.NODE_ENV !== "production") {
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
  },
};
