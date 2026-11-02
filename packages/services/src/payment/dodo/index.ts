import type { PaymentGatewayPlugin } from "../gateway-plugin.ts";
import { DodoPaymentGateway } from "./dodo.gateway.ts";

export * from "./dodo.gateway.ts";

/**
 * Dodo Payments, for buyers outside India. Off until DODO_PAYMENTS_API_KEY
 * is set; checkouts it would have taken then go to the default gateway.
 */
export const dodoGatewayPlugin: PaymentGatewayPlugin = {
  provider: "dodo",
  create(config) {
    if (!config.DODO_PAYMENTS_API_KEY) return undefined;

    if (!config.DODO_PAYMENTS_WEBHOOK_KEY) {
      console.warn(
        "[commerce] DODO_PAYMENTS_WEBHOOK_KEY is not set — every Dodo Payments webhook " +
          "will be rejected, and payments the browser does not confirm wait for the recovery cycle.",
      );
    }

    return new DodoPaymentGateway({
      apiKey: config.DODO_PAYMENTS_API_KEY,
      webhookKey: config.DODO_PAYMENTS_WEBHOOK_KEY,
      environment: config.DODO_PAYMENTS_ENVIRONMENT,
      // Only reached when the checkout had to leave the page (a bank's own
      // page, for one): the order shows there once it is confirmed.
      returnUrl: new URL("/purchase-history", config.WEB_URL).toString(),
      taxInclusive: config.DODO_PAYMENTS_TAX_INCLUSIVE,
    });
  },
};
