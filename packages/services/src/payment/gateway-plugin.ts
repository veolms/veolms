import type { ServerConfig } from "@veolms/config";
import type { PaymentGateway, PaymentProvider } from "@veolms/contracts";

/**
 * A payment gateway the server can take money through. Adding a gateway is
 * writing one of these (the gateway itself implements `PaymentGateway`) and
 * listing it in `paymentGatewayPlugins`; checkout, verification, webhooks,
 * recovery and refunds then reach it by its `provider` name, which is what
 * its payments are recorded under.
 */
export interface PaymentGatewayPlugin {
  readonly provider: PaymentProvider;
  /**
   * The gateway, set up from the server's config. Undefined when the config
   * leaves it off (its keys are not set): it is then offered to nobody.
   */
  create(config: ServerConfig): PaymentGateway | undefined;
}
