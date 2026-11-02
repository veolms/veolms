import type { PaymentGatewayPlugin } from "../gateway-plugin.ts";
import { CashfreePaymentGateway } from "./cashfree.gateway.ts";

export * from "./cashfree.gateway.ts";

/**
 * Cashfree Payments. Off until CASHFREE_APP_ID and CASHFREE_SECRET_KEY are
 * set; checkouts it would have taken then go to the default gateway.
 */
export const cashfreeGatewayPlugin: PaymentGatewayPlugin = {
  provider: "cashfree",
  create(config) {
    if (!config.CASHFREE_APP_ID || !config.CASHFREE_SECRET_KEY) {
      return undefined;
    }

    return new CashfreePaymentGateway({
      appId: config.CASHFREE_APP_ID,
      secretKey: config.CASHFREE_SECRET_KEY,
      environment: config.CASHFREE_ENVIRONMENT,
      // Only reached when the payment had to leave the page (a bank's own
      // page, for one): the order shows there once it is confirmed.
      returnUrl: new URL("/purchase-history", config.WEB_URL).toString(),
    });
  },
};
