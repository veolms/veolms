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
    fallbackGateway: options.services.paymentGateway,
  });
  const controller = createCreatorGatewayController({ service });

  // 1. POST /payments/gateway-config - Connect / save payment gateway keys 
  app.post(
    "/payments/gateway-config",
    {
      preHandler: ctx.requireAdmin,
      schema: {
        operationId: "savePaymentGatewayConfig",
        tags: ["Commerce - Payment Gateways"],
        summary: "Connect payment gateway",
        description:
          "Stores and encrypts payment gateway API keys so course sales route funds into the merchant account.",
        body: saveCreatorPaymentConfigRequestSchema,
        response: {
          200: jsonResponse(
            "Payment configuration saved",
            creatorPaymentConfigSchema,
          ),
          400: errorResponse("Invalid gateway keys"),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
        },
      },
    },
    controller.saveConfig,
  );

  // 2. GET /payments/gateway-config - Get active gateway status
  app.get(
    "/payments/gateway-config",
    {
      preHandler: ctx.requireAdmin,
      schema: {
        operationId: "getPaymentGatewayConfig",
        tags: ["Commerce - Payment Gateways"],
        summary: "Get payment gateway configuration",
        description: "Returns active payment provider and masked key ID.",
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
