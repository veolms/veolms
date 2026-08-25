import type { ServerConfig } from "@veolms/config";
import type { PaymentGateway } from "@veolms/contracts";
import { RazorpayPaymentGateway } from "./razorpay/razorpay.gateway.ts";

/**
 * Creates the active payment gateway based on configuration.
 * Allows effortless substitution of providers (Razorpay, Stripe, Mock) in future.
 */
export function createPaymentGateway(config: ServerConfig): PaymentGateway {
  return new RazorpayPaymentGateway({
    keyId: config.RAZORPAY_KEY_ID ?? "rzp_test_placeholder_key",
    keySecret: config.RAZORPAY_KEY_SECRET ?? "rzp_test_placeholder_secret",
    webhookSecret: config.RAZORPAY_WEBHOOK_SECRET,
  });
}
