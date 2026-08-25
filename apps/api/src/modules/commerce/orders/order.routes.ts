import { z } from "zod";
import { orderSchema } from "@veolms/contracts";
import { jsonResponse } from "../../../lib/responses.ts";
import { errorResponse } from "../../../lib/errors.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { createCommerceContext } from "../shared/commerce.context.ts";
import { createOrderService } from "./order.service.ts";
import { createOrderController } from "./order.controller.ts";

const orderRoutes: RoutePlugin = async (app, options) => {
  const ctx = createCommerceContext(options);
  const service = createOrderService({ database: options.database });
  const controller = createOrderController({ service });

  // 1. GET /orders - List authenticated student orders
  app.get(
    "/orders",
    {
      preHandler: ctx.requireAuthenticated,
      schema: {
        operationId: "listMyOrders",
        tags: ["Commerce - Orders"],
        summary: "List student orders",
        description: "Returns the authenticated student's historical and active orders.",
        response: {
          200: jsonResponse("List of student orders", z.array(orderSchema)),
          401: errorResponse("Unauthorized"),
        },
      },
    },
    controller.listOrders,
  );

  // 2. GET /orders/:orderId - Get student order details
  app.get(
    "/orders/:orderId",
    {
      preHandler: ctx.requireAuthenticated,
      schema: {
        operationId: "getMyOrderById",
        tags: ["Commerce - Orders"],
        summary: "Get student order by ID",
        description: "Returns order details including item snapshots for an owned order.",
        params: z.object({ orderId: z.uuid() }),
        response: {
          200: jsonResponse("Order details", orderSchema),
          401: errorResponse("Unauthorized"),
          404: errorResponse("Order not found"),
        },
      },
    },
    controller.getOrder,
  );
};

export default orderRoutes;
