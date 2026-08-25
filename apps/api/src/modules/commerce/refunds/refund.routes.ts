import { z } from "zod";
import {
  refundSchema,
  createRefundRequestSchema,
} from "@veolms/contracts";
import { jsonResponse } from "../../../lib/responses.ts";
import { errorResponse } from "../../../lib/errors.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { createCommerceContext } from "../shared/commerce.context.ts";
import { createRefundService } from "./refund.service.ts";
import { createRefundController } from "./refund.controller.ts";

const refundRoutes: RoutePlugin = async (app, options) => {
  const ctx = createCommerceContext(options);
  const service = createRefundService({
    database: options.database,
    paymentGateway: options.services.paymentGateway,
  });
  const controller = createRefundController({ service });

  // 1. POST /refunds - Initiate refund
  app.post(
    "/refunds",
    {
      preHandler: ctx.requireAdmin,
      schema: {
        operationId: "createRefund",
        tags: ["Commerce - Refunds"],
        summary: "Initiate full or partial refund",
        description: "Initiates a refund via the payment gateway and records refund state.",
        body: createRefundRequestSchema,
        response: {
          200: jsonResponse("Refund initiated successfully", refundSchema),
          400: errorResponse("Refund not allowed"),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden - Admin required"),
          404: errorResponse("Order or payment not found"),
        },
      },
    },
    controller.createRefund,
  );

  // 2. GET /refunds/:refundId - Get refund details
  app.get(
    "/refunds/:refundId",
    {
      preHandler: ctx.requireAdmin,
      schema: {
        operationId: "getRefund",
        tags: ["Commerce - Refunds"],
        summary: "Get refund by ID",
        params: z.object({ refundId: z.uuid() }),
        response: {
          200: jsonResponse("Refund details", refundSchema),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden - Admin required"),
        },
      },
    },
    controller.getRefund,
  );

  // 3. GET /refunds/order/:orderId - List all refunds for an order
  app.get(
    "/refunds/order/:orderId",
    {
      preHandler: ctx.requireAdmin,
      schema: {
        operationId: "listOrderRefunds",
        tags: ["Commerce - Refunds"],
        summary: "List refunds for an order",
        params: z.object({ orderId: z.uuid() }),
        response: {
          200: jsonResponse("List of refunds", z.array(refundSchema)),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden - Admin required"),
        },
      },
    },
    controller.listOrderRefunds,
  );
};

export default refundRoutes;
