import { z } from "zod";
import {
  refundSchema,
  createRefundRequestSchema,
  refundRequestSchema,
  createStudentRefundRequestSchema,
  reviewRefundRequestSchema,
} from "@veolms/contracts";
import { jsonResponse } from "../../../lib/responses.ts";
import { errorResponse } from "../../../lib/errors.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { createCommerceContext } from "../shared/commerce.context.ts";
import { createRefundService } from "./refund.service.ts";
import { createRefundController } from "./refund.controller.ts";
import { createRefundRequestService } from "./refund-request.service.ts";
import { createRefundRequestController } from "./refund-request.controller.ts";

const refundRoutes: RoutePlugin = async (app, options) => {
  const ctx = createCommerceContext(options);
  const service = createRefundService({
    database: options.database,
    paymentGateway: options.services.paymentGateway,
  });
  const controller = createRefundController({ service });

  const requestService = createRefundRequestService({
    database: options.database,
    refundService: service,
  });
  const requestController = createRefundRequestController({
    service: requestService,
  });

  // 1. POST /refunds - Initiate direct admin refund
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

  // 4. POST /orders/:orderId/refund-requests - Submit student refund request 
  app.post(
    "/orders/:orderId/refund-requests",
    {
      preHandler: ctx.requireAuthenticated,
      schema: {
        operationId: "submitStudentRefundRequest",
        tags: ["Commerce - Refund Requests"],
        summary: "Submit a refund request for an order",
        description: "Allows an enrolled student to request a refund for a paid order.",
        params: z.object({ orderId: z.uuid() }),
        body: createStudentRefundRequestSchema,
        response: {
          201: jsonResponse("Refund request submitted", refundRequestSchema),
          400: errorResponse("Order not refundable"),
          401: errorResponse("Unauthorized"),
          404: errorResponse("Order not found"),
          409: errorResponse("Refund request already exists"),
        },
      },
    },
    requestController.submitRequest,
  );

  // 5. GET /refund-requests/my - List student's submitted refund requests
  app.get(
    "/refund-requests/my",
    {
      preHandler: ctx.requireAuthenticated,
      schema: {
        operationId: "listMyRefundRequests",
        tags: ["Commerce - Refund Requests"],
        summary: "List current student's refund requests",
        response: {
          200: jsonResponse(
            "List of student refund requests",
            z.array(refundRequestSchema),
          ),
          401: errorResponse("Unauthorized"),
        },
      },
    },
    requestController.listMyRequests,
  );

  // 6. GET /refund-requests - List all refund requests for review
  app.get(
    "/refund-requests",
    {
      preHandler: ctx.requireAdmin,
      schema: {
        operationId: "listRefundRequests",
        tags: ["Commerce - Refund Requests"],
        summary: "List all refund requests for review",
        querystring: z.object({
          status: z.enum(["pending", "approved", "rejected", "cancelled"]).optional(),
        }),
        response: {
          200: jsonResponse(
            "List of refund requests",
            z.array(refundRequestSchema),
          ),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden - Admin required"),
        },
      },
    },
    requestController.listAllRequests,
  );

  // 7. POST /refund-requests/:requestId/review - Review/approve/reject refund request
  app.post(
    "/refund-requests/:requestId/review",
    {
      preHandler: ctx.requireAdmin,
      schema: {
        operationId: "reviewRefundRequest",
        tags: ["Commerce - Refund Requests"],
        summary: "Approve or reject student refund request",
        params: z.object({ requestId: z.uuid() }),
        body: reviewRefundRequestSchema,
        response: {
          200: jsonResponse("Refund request reviewed", refundRequestSchema),
          400: errorResponse("Invalid action or already resolved"),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden - Admin required"),
          404: errorResponse("Refund request not found"),
        },
      },
    },
    requestController.reviewRequest,
  );
};

export default refundRoutes;
