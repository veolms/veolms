import {
  creatorPaymentConfigSchema,
  saveCreatorPaymentConfigRequestSchema,
} from "@veolms/contracts";
import { jsonResponse } from "../../../../lib/responses.ts";
import { errorResponse } from "../../../../lib/errors.ts";
import type { RoutePlugin } from "../../../../lib/route-plugin.ts";
import { createCommerceContext } from "../../shared/commerce.context.ts";
import { createCreatorGatewayService } from "./creator-gateway.service.ts";
import { createCreatorGatewayController } from "./creator-gateway.controller.ts";
import { config } from "../../../../config.ts";

const creatorGatewayRoutes: RoutePlugin = async (app, options) => {
  const ctx = createCommerceContext(options);
  const service = createCreatorGatewayService({
    database: options.database,
    config,
    fallbackGateway: options.services.paymentGateways.primary,
  });
  const controller = createCreatorGatewayController({ service });

  // 1. POST /payments/gateway-config - Connect / save payment gateway keys
  app.post(
    "/payments/gateway-config",
    {
      preHandler: ctx.requires("payment.gateway.manage"),
      schema: {
        operationId: "savePaymentGatewayConfig",
        tags: ["Commerce - Payment Gateways"],
        summary: "Connect payment gateway (not available)",
        description:
          "Not available: answers 409 and stores nothing. Payments are taken through the platform's configured gateway; keys stored through this endpoint were never used to take or route a payment.",
        body: saveCreatorPaymentConfigRequestSchema,
        response: {
          200: jsonResponse(
            "Payment configuration saved",
            creatorPaymentConfigSchema,
          ),
          400: errorResponse("Invalid gateway keys"),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
          409: errorResponse("Connecting a gateway is not available"),
        },
      },
    },
    controller.saveConfig,
  );

  // 2. GET /payments/gateway-config - Get active gateway status
  app.get(
    "/payments/gateway-config",
    {
      preHandler: ctx.requires("payment.gateway.manage"),
      schema: {
        operationId: "getPaymentGatewayConfig",
        tags: ["Commerce - Payment Gateways"],
        summary: "Get payment gateway configuration",
        description:
          "Returns the provider and masked key ID stored earlier, if any. A stored key is not used for payments.",
        response: {
          200: jsonResponse(
            "Payment config",
            creatorPaymentConfigSchema.nullable(),
          ),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
        },
      },
    },
    controller.getConfig,
  );
};

export default creatorGatewayRoutes;
