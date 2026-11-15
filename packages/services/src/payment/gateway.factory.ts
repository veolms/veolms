import type { ServerConfig } from "@veolms/config";
import type { PaymentGateway, PaymentGateways } from "@veolms/contracts";
import type { PaymentGatewayPlugin } from "./gateway-plugin.ts";
import { razorpayGatewayPlugin } from "./razorpay/index.ts";
import { dodoGatewayPlugin } from "./dodo/index.ts";
import { cashfreeGatewayPlugin } from "./cashfree/index.ts";

/** Every gateway this server knows how to use, set up or not. */
export const paymentGatewayPlugins: readonly PaymentGatewayPlugin[] = [
  razorpayGatewayPlugin,
  dodoGatewayPlugin,
  cashfreeGatewayPlugin,
];

/**
 * Countries a request can name without naming one: Cloudflare sends XX when
 * it does not know, T1 for Tor.
 */
const UNKNOWN_COUNTRIES = new Set(["XX", "T1"]);

let gatewaysProvider: (() => PaymentGateways | undefined) | null = null;

/**
 * Sets (or with null removes) a provider asked, each time a gateway is
 * needed, for the gateways to use instead of the configured ones: for a
 * deployment whose gateway accounts differ by the site a request or a
 * background item is for. When it returns undefined, the configured
 * gateways are used. Build what it returns with `buildPaymentGateways`.
 */
export function setPaymentGatewaysProvider(
  next: (() => PaymentGateways | undefined) | null,
): void {
  gatewaysProvider = next;
}

/**
 * The configured gateways, asking the provider (see
 * `setPaymentGatewaysProvider`) first at every use. What every service is
 * given.
 */
export function createPaymentGateways(
  config: ServerConfig,
  plugins: readonly PaymentGatewayPlugin[] = paymentGatewayPlugins,
): PaymentGateways {
  const configured = buildPaymentGateways(config, plugins);
  const current = () => gatewaysProvider?.() ?? configured;
  return {
    get primary() {
      return current().primary;
    },
    get all() {
      return current().all;
    },
    get: (provider) => current().get(provider),
    forCountry: (country) => current().forCountry(country),
  };
}

/**
 * Sets up every gateway the config turns on, and the rule a new checkout
 * picks one by (PAYMENT_GATEWAY_DEFAULT, PAYMENT_GATEWAY_BY_COUNTRY).
 */
export function buildPaymentGateways(
  config: ServerConfig,
  plugins: readonly PaymentGatewayPlugin[] = paymentGatewayPlugins,
): PaymentGateways {
  const byProvider = new Map<string, PaymentGateway>();
  for (const plugin of plugins) {
    const gateway = plugin.create(config);
    if (gateway) byProvider.set(plugin.provider, gateway);
  }

  const primary = byProvider.get(config.PAYMENT_GATEWAY_DEFAULT);
  if (!primary) {
    throw new Error(
      `PAYMENT_GATEWAY_DEFAULT is "${config.PAYMENT_GATEWAY_DEFAULT}", which is not a payment gateway that is set up ` +
        `(set up: ${[...byProvider.keys()].join(", ") || "none"}).`,
    );
  }

  const known = new Set(plugins.map((plugin) => plugin.provider as string));
  for (const { provider } of config.PAYMENT_GATEWAY_BY_COUNTRY) {
    if (!known.has(provider)) {
      console.warn(
        `[commerce] PAYMENT_GATEWAY_BY_COUNTRY names "${provider}", which is not a payment gateway; that pair is ignored.`,
      );
    }
  }
  // Pairs whose gateway is not set up are left out, so that a country they
  // name falls through to "*" or the default.
  const rules = config.PAYMENT_GATEWAY_BY_COUNTRY.flatMap(
    ({ country, provider }) => {
      const gateway = byProvider.get(provider);
      return gateway ? [{ country, gateway }] : [];
    },
  );

  return {
    primary,
    all: [primary, ...[...byProvider.values()].filter((g) => g !== primary)],
    get: (provider) => byProvider.get(provider),
    forCountry(country) {
      const code = country?.trim().toUpperCase();
      if (!code || UNKNOWN_COUNTRIES.has(code)) return primary;
      return (
        rules.find((rule) => rule.country === code)?.gateway ??
        rules.find((rule) => rule.country === "*")?.gateway ??
        primary
      );
    },
  };
}
