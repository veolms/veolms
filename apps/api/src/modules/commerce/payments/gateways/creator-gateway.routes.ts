import {
  academyPaymentGatewaySchema,
  academyPaymentGatewaysResponseSchema,
  connectPaymentGatewayResponseSchema,
  connectRazorpayRequestSchema,
} from "@veolms/contracts";

import { errorResponse } from "../../../../lib/errors.ts";
import { jsonResponse } from "../../../../lib/responses.ts";
import type { RoutePlugin } from "../../../../lib/route-plugin.ts";
import { createCommerceContext } from "../../shared/commerce.context.ts";
import { bindAcademyGateways } from "./academy-gateways.ts";
import { createCreatorGatewayService } from "./creator-gateway.service.ts";

/**
 * Platform → Payments: the academy's own Razorpay account
 * (creator-features/36-academy-payment-gateway-plan.md). Staff with
 * `payment.gateway.manage` only. Secrets go in, never out: responses carry
 * the masked Key ID, and the webhook secret only once, when it is made.
 */
const creatorGatewayRoutes: RoutePlugin = async (app, options) => {
  const ctx = createCommerceContext(options);
  bindAcademyGateways(options.database);
  const service = createCreatorGatewayService({
    database: options.database,
    paymentGateways: options.services.paymentGateways,
    email: options.services.email,
    logger: app.log,
  });
  const manage = ctx.requires("payment.gateway.manage");
  const tags = ["Commerce - Payment Gateways"];
  const denied = {
    401: errorResponse("Unauthorized"),
    403: errorResponse("Forbidden"),
  };
  // Nothing about payment keys is kept by browsers or proxies.
  const noStore = {
    onSend: async (
      _request: unknown,
      reply: { header: (k: string, v: string) => unknown },
    ) => {
      reply.header("Cache-Control", "no-store");
    },
  };

  app.get(
    "/payments/gateway-config",
    {
      preHandler: manage,
      ...noStore,
      schema: {
        operationId: "getPaymentGatewayConfig",
        tags,
        summary: "The academy's payment account",
        description:
          "Whether Razorpay is connected, in test or live mode, the masked Key ID, and the webhook address to give Razorpay.",
        response: {
          200: jsonResponse(
            "The academy's gateways.",
            academyPaymentGatewaysResponseSchema,
          ),
          ...denied,
        },
      },
    },
    async () => ({ gateways: [await service.status()] }),
  );

  app.put(
    "/payments/gateway-config/razorpay",
    {
      preHandler: manage,
      ...noStore,
      config: { rateLimit: { max: 10, timeWindow: "10 minutes" } },
      schema: {
        operationId: "connectRazorpay",
        tags,
        summary: "Connect or replace the academy's Razorpay keys",
        description:
          "Checks the keys with Razorpay (a read, no money moves), stores them encrypted, and makes a webhook secret, returned this once. Every admin is told by email.",
        body: connectRazorpayRequestSchema,
        response: {
          200: jsonResponse("Connected.", connectPaymentGatewayResponseSchema),
          400: errorResponse("Razorpay refused the keys"),
          ...denied,
          502: errorResponse("Razorpay could not be reached"),
          503: errorResponse("Keys can't be stored safely on this server"),
        },
      },
    },
    async (request) =>
      await service.connectRazorpay(request.user!.id, request.body),
  );

  app.post(
    "/payments/gateway-config/razorpay/webhook-secret",
    {
      preHandler: manage,
      ...noStore,
      config: { rateLimit: { max: 10, timeWindow: "10 minutes" } },
      schema: {
        operationId: "renewRazorpayWebhookSecret",
        tags,
        summary: "Make a new webhook secret",
        description:
          "Returned this once. Paste it into the webhook in the Razorpay dashboard; until then Razorpay's events are refused.",
        response: {
          200: jsonResponse(
            "The new secret.",
            connectPaymentGatewayResponseSchema,
          ),
          ...denied,
          404: errorResponse("Not connected"),
        },
      },
    },
    async (request) => await service.renewWebhookSecret(request.user!.id),
  );

  app.delete(
    "/payments/gateway-config/razorpay",
    {
      preHandler: manage,
      ...noStore,
      schema: {
        operationId: "disconnectRazorpay",
        tags,
        summary: "Remove the academy's Razorpay keys",
        description:
          "The stored keys are deleted. Every admin is told by email.",
        response: {
          200: jsonResponse("Removed.", academyPaymentGatewaySchema),
          ...denied,
          404: errorResponse("Not connected"),
        },
      },
    },
    async (request) => await service.disconnect(request.user!.id),
  );
};

export default creatorGatewayRoutes;
