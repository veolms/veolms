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

  // 1. POST /creator/payments/config - Connect / save creator's gateway keys (FR-PAY-002)
  app.post(
    "/creator/payments/config",
    {
      preHandler: ctx.requireAdmin, // Creator/Admin role
      schema: {
        operationId: "saveCreatorPaymentConfig",
        tags: ["Commerce - Creator Gateways"],
        summary: "Connect creator payment gateway",
        description:
          "Stores and encrypts creator-specific Razorpay API keys so direct course sales route funds into the creator account.",
        body: saveCreatorPaymentConfigRequestSchema,
        response: {
          200: jsonResponse(
            "Creator payment configuration saved",
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

  // 2. GET /creator/payments/config - Get active creator gateway status
  app.get(
    "/creator/payments/config",
    {
      preHandler: ctx.requireAdmin,
      schema: {
        operationId: "getCreatorPaymentConfig",
        tags: ["Commerce - Creator Gateways"],
        summary: "Get creator payment gateway configuration",
        description: "Returns active payment provider and masked key ID.",
        response: {
          200: jsonResponse(
            "Creator payment config",
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
