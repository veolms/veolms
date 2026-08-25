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

  // 1. POST /admin/refunds - Initiate refund
  app.post(
    "/admin/refunds",
    {
      preHandler: ctx.requireAdmin,
      schema: {
        operationId: "createRefund",
        tags: ["Commerce - Admin Refunds"],
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

  // 2. GET /admin/refunds/:refundId - Get refund details
  app.get(
    "/admin/refunds/:refundId",
    {
      preHandler: ctx.requireAdmin,
      schema: {
        operationId: "getRefund",
        tags: ["Commerce - Admin Refunds"],
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

  // 3. GET /admin/orders/:orderId/refunds - List all refunds for an order
  app.get(
    "/admin/orders/:orderId/refunds",
    {
      preHandler: ctx.requireAdmin,
      schema: {
        operationId: "listOrderRefunds",
        tags: ["Commerce - Admin Refunds"],
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
