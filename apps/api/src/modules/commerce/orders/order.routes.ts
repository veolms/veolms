import { z } from "zod";
import {
  orderResponseSchema,
  invoiceSchema,
  ordersListQuerySchema,
  ordersListResponseSchema,
  orderStatsQuerySchema,
  orderStatsResponseSchema,
  orderDirectRefundRequestSchema,
  refundResultSchema,
  needsRefundListQuerySchema,
  needsRefundListResponseSchema,
} from "@veolms/contracts";
import { jsonResponse } from "../../../lib/responses.ts";
import { errorResponse } from "../../../lib/errors.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { createCommerceContext } from "../shared/commerce.context.ts";
import { createOrderService } from "./order.service.ts";
import { createNeedsRefundService } from "./needs-refund.service.ts";
import {
  createInvoiceService,
  invoiceStorage,
} from "../invoices/invoice.service.ts";
import { createRefundService } from "../refunds/refund.service.ts";
import { createAuthorizationService } from "../../authorization/authorization.service.ts";
import { createOrderController } from "./order.controller.ts";

const orderRoutes: RoutePlugin = async (app, options) => {
  const ctx = createCommerceContext(options);
  const service = createOrderService({ database: options.database });
  const invoiceService = createInvoiceService({
    database: options.database,
    storage: invoiceStorage(options.services.storage),
  });
  const refundService = createRefundService({
    database: options.database,
    paymentGateways: options.services.paymentGateways,
  });
  const authorizationService = createAuthorizationService(options.database);
  const needsRefundService = createNeedsRefundService({
    database: options.database,
  });

  const controller = createOrderController({
    service,
    needsRefundService,
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
          200: jsonResponse(
            "Paginated list of orders",
            ordersListResponseSchema,
          ),
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
          "Computes net revenue, total orders, unique buyers, and refunds for the orders matching the filters (refunds are those made against the same orders, so net revenue is never negative). Figures describe a single currency: pass currency to choose, otherwise the most-ordered one is used and named in currency. Results are cached for up to 30 seconds.",
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

  // 2b. GET /orders/needs-refund - Money staff must return by hand (registered BEFORE :orderId)
  app.get(
    "/orders/needs-refund",
    {
      preHandler: ctx.requireAuthenticated,
      schema: {
        operationId: "listOrdersNeedingRefund",
        tags: ["Commerce - Orders"],
        summary: "List payments that need a manual refund",
        description:
          "Returns, newest first, the money staff have to return by hand: gateway payments captured for an order that was already paid another way (kind surplus_payment, refundable only from the gateway dashboard), later orders of a buyer who paid twice for the same course (kind duplicate_purchase, the later order is the one to refund), and transfers a buyer reported for an order that was then paid another way and that are still waiting for review (kind manual_transfer_for_paid_order, to be checked at the bank, returned outside the platform if they arrived, and rejected). Read-only: nothing is refunded and no access changes. Amounts are in minor units.",
        querystring: needsRefundListQuerySchema,
        response: {
          200: jsonResponse(
            "Payments that need a manual refund",
            needsRefundListResponseSchema,
          ),
          400: errorResponse("Invalid query parameters or cursor"),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden - billing.read required"),
        },
      },
    },
    controller.listNeedsRefund,
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
        description:
          "Returns order details for an owned order or admin inspection.",
        params: z.object({ orderId: z.string().uuid() }),
        querystring: z.object({
          view: z.enum(["admin", "student"]).optional(),
        }),
        response: {
          200: jsonResponse("Order details", orderResponseSchema),
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
        description:
          "Returns full invoice receipt data for an owned or admin-inspected order.",
        params: z.object({ orderId: z.string().uuid() }),
        querystring: z.object({
          view: z.enum(["admin", "student"]).optional(),
        }),
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

  // 5. GET /orders/:orderId/invoice/download - Download the invoice as a PDF
  app.get(
    "/orders/:orderId/invoice/download",
    {
      preHandler: ctx.requireAuthenticated,
      schema: {
        operationId: "downloadOrderInvoice",
        tags: ["Commerce - Orders"],
        summary: "Download the order's invoice as a PDF",
        description:
          "Redirects (302) to a short-lived link to the paid order's stored invoice PDF, making and storing it first if it has not been made yet. Without object storage, returns the PDF itself.",
        params: z.object({ orderId: z.string().uuid() }),
        querystring: z.object({
          view: z.enum(["admin", "student"]).optional(),
        }),
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
        description:
          "Processes a full or partial refund for a paid order. An order paid through the payment gateway is refunded through it. An order paid by manual transfer has no gateway payment: staff return the money themselves and send outsideRefund with the reference of that transfer, which records the refund without moving any money (the order is marked refunded, a credit note is issued, the buyer is notified and access follows preserveAccess). outsideRefund is refused for an order that was not paid by manual transfer, and an order paid by manual transfer is refused without it. One reference can be recorded once.",
        params: z.object({ orderId: z.string().uuid() }),
        body: orderDirectRefundRequestSchema,
        headers: z
          .object({
            "idempotency-key": z.string().min(1).max(255).optional(),
          })
          .passthrough(),
        response: {
          200: jsonResponse(
            "Refund processed successfully, or the original refund when the idempotency key was already used",
            refundResultSchema,
          ),
          400: errorResponse("Refund not allowed"),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden - billing.manage required"),
          404: errorResponse("Order not found"),
          409: errorResponse(
            "Idempotency key already used for a different refund request, or an outside refund with this reference is already recorded",
          ),
        },
      },
    },
    controller.refundOrder,
  );
};

export default orderRoutes;
