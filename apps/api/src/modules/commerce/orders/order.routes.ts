import { z } from "zod";
import { orderSchema, invoiceSchema } from "@veolms/contracts";
import { jsonResponse } from "../../../lib/responses.ts";
import { errorResponse } from "../../../lib/errors.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { createCommerceContext } from "../shared/commerce.context.ts";
import { createOrderService } from "./order.service.ts";
import { createInvoiceService } from "../invoices/invoice.service.ts";
import { createOrderController } from "./order.controller.ts";

const orderRoutes: RoutePlugin = async (app, options) => {
  const ctx = createCommerceContext(options);
  const service = createOrderService({ database: options.database });
  const invoiceService = createInvoiceService({ database: options.database });
  const controller = createOrderController({ service, invoiceService });

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

  // 3. GET /orders/:orderId/invoice - Get order invoice receipt data
  app.get(
    "/orders/:orderId/invoice",
    {
      preHandler: ctx.requireAuthenticated,
      schema: {
        operationId: "getOrderInvoice",
        tags: ["Commerce - Orders"],
        summary: "Get order invoice details",
        description: "Returns full invoice receipt data for an owned or admin-inspected order.",
        params: z.object({ orderId: z.uuid() }),
        response: {
          200: jsonResponse("Order invoice data", invoiceSchema),
          401: errorResponse("Unauthorized"),
          404: errorResponse("Order not found"),
        },
      },
    },
    controller.getInvoice,
  );

  // 4. GET /orders/:orderId/invoice/download - Download formatted invoice HTML
  app.get(
    "/orders/:orderId/invoice/download",
    {
      preHandler: ctx.requireAuthenticated,
      schema: {
        operationId: "downloadOrderInvoice",
        tags: ["Commerce - Orders"],
        summary: "Download printable order invoice receipt",
        description: "Returns downloadable HTML receipt file for printing or saving as PDF.",
        params: z.object({ orderId: z.uuid() }),
        response: {
          401: errorResponse("Unauthorized"),
          404: errorResponse("Order not found"),
        },
      },
    },
    controller.downloadInvoice,
  );
};

export default orderRoutes;
