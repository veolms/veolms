import { z } from "zod";
import {
  orderSchema,
  invoiceSchema,
  ordersListQuerySchema,
  ordersListResponseSchema,
  orderStatsQuerySchema,
  orderStatsResponseSchema,
  orderDirectRefundRequestSchema,
  refundSchema,
} from "@veolms/contracts";
import { jsonResponse } from "../../../lib/responses.ts";
import { errorResponse } from "../../../lib/errors.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { createCommerceContext } from "../shared/commerce.context.ts";
import { createOrderService } from "./order.service.ts";
import { createInvoiceService } from "../invoices/invoice.service.ts";
import { createRefundService } from "../refunds/refund.service.ts";
import { createAuthorizationService } from "../../authorization/authorization.service.ts";
import { createOrderController } from "./order.controller.ts";

const orderRoutes: RoutePlugin = async (app, options) => {
  const ctx = createCommerceContext(options);
  const service = createOrderService({ database: options.database });
  const invoiceService = createInvoiceService({ database: options.database });
  const refundService = createRefundService({
    database: options.database,
    paymentGateway: options.services.paymentGateway,
  });
  const authorizationService = createAuthorizationService(options.database);

  const controller = createOrderController({
    service,
    invoiceService,
    refundService,
    authorizationService,
  });

  // 1. GET /orders - Unified orders listing (student or admin scope via `view` intent)
  app.get(
    "/orders",
    {
      preHandler: ctx.requireAuthenticated,
      schema: {
        operationId: "listOrders",
        tags: ["Commerce - Orders"],
        summary: "List orders",
        description:
          "Returns orders for the authenticated user or entire academy when requested with view=admin.",
        querystring: ordersListQuerySchema,
        response: {
          200: jsonResponse("Paginated list of orders", ordersListResponseSchema),
          400: errorResponse("Invalid query parameters or cursor"),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
        },
      },
    },
    controller.listOrders,
  );

  // 2. GET /orders/stats - Academy orders aggregated metrics (registered BEFORE :orderId)
  app.get(
    "/orders/stats",
    {
      preHandler: ctx.requireAuthenticated,
      schema: {
        operationId: "getOrderStats",
        tags: ["Commerce - Orders"],
        summary: "Get order statistics",
        description:
          "Computes net revenue, total orders, unique buyers, and refunds for the orders matching the filters (refunds are those made against the same orders, so net revenue is never negative). Figures describe a single currency: pass currency to choose, otherwise the most-ordered one is used and all present currencies are listed in currencies. Results are cached for up to 30 seconds.",
        querystring: orderStatsQuerySchema,
        response: {
          200: jsonResponse("Order statistics", orderStatsResponseSchema),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden - billing.read required"),
        },
      },
    },
    controller.getOrderStats,
  );

  // 3. GET /orders/:orderId - Order details (UUID validated)
  app.get(
    "/orders/:orderId",
    {
      preHandler: ctx.requireAuthenticated,
      schema: {
        operationId: "getOrderById",
        tags: ["Commerce - Orders"],
        summary: "Get order by ID",
        description: "Returns order details for an owned order or admin inspection.",
        params: z.object({ orderId: z.string().uuid() }),
        querystring: z.object({ view: z.enum(["admin", "student"]).optional() }),
        response: {
          200: jsonResponse("Order details", orderSchema),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
          404: errorResponse("Order not found"),
        },
      },
    },
    controller.getOrder,
  );

  // 4. GET /orders/:orderId/invoice - Order invoice receipt data
  app.get(
    "/orders/:orderId/invoice",
    {
      preHandler: ctx.requireAuthenticated,
      schema: {
        operationId: "getOrderInvoice",
        tags: ["Commerce - Orders"],
        summary: "Get order invoice details",
        description: "Returns full invoice receipt data for an owned or admin-inspected order.",
        params: z.object({ orderId: z.string().uuid() }),
        querystring: z.object({ view: z.enum(["admin", "student"]).optional() }),
        response: {
          200: jsonResponse("Order invoice data", invoiceSchema),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
          404: errorResponse("Order not found"),
        },
      },
    },
    controller.getInvoice,
  );

  // 5. GET /orders/:orderId/invoice/download - Download printable HTML invoice
  app.get(
    "/orders/:orderId/invoice/download",
    {
      preHandler: ctx.requireAuthenticated,
      schema: {
        operationId: "downloadOrderInvoice",
        tags: ["Commerce - Orders"],
        summary: "Download printable order invoice receipt",
        description: "Returns downloadable HTML receipt file.",
        params: z.object({ orderId: z.string().uuid() }),
        querystring: z.object({ view: z.enum(["admin", "student"]).optional() }),
        response: {
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
          404: errorResponse("Order not found"),
        },
      },
    },
    controller.downloadInvoice,
  );

  // 6. POST /orders/:orderId/refund - Direct order refund
  app.post(
    "/orders/:orderId/refund",
    {
      preHandler: ctx.requireAuthenticated,
      schema: {
        operationId: "refundOrder",
        tags: ["Commerce - Orders"],
        summary: "Refund an order",
        description: "Processes a full or partial refund for a paid order.",
        params: z.object({ orderId: z.string().uuid() }),
        body: orderDirectRefundRequestSchema,
        headers: z.object({
          "idempotency-key": z.string().min(1).max(255).optional(),
        }).passthrough(),
        response: {
          200: jsonResponse(
            "Refund processed successfully, or the original refund when the idempotency key was already used",
            refundSchema,
          ),
          400: errorResponse("Refund not allowed"),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden - billing.manage required"),
          404: errorResponse("Order not found"),
          409: errorResponse("Idempotency key already used for a different refund request"),
        },
      },
    },
    controller.refundOrder,
  );
};

export default orderRoutes;
