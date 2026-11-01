import { z } from "zod";
import {
  verifyPaymentRequestSchema,
  verifyPaymentResponseSchema,
  manualPaymentRequestSchema,
  manualPaymentStatusSchema,
  learnerManualPaymentRequestSchema,
  submitManualPaymentRequestSchema,
  verifyManualPaymentRequestSchema,
} from "@veolms/contracts";
import { jsonResponse } from "../../../lib/responses.ts";
import { errorResponse } from "../../../lib/errors.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { createCommerceContext } from "../shared/commerce.context.ts";
import { createPaymentService } from "./payment.service.ts";
import { createPaymentController } from "./payment.controller.ts";
import { createManualPaymentService } from "./manual-payment.service.ts";
import { createManualPaymentController } from "./manual-payment.controller.ts";

const paymentRoutes: RoutePlugin = async (app, options) => {
  const ctx = createCommerceContext(options);
  const service = createPaymentService({
    database: options.database,
    paymentGateway: options.services.paymentGateway,
    logger: app.log,
  });
  const controller = createPaymentController({ service });

  const manualService = createManualPaymentService({
    database: options.database,
  });
  const manualController = createManualPaymentController({
    service: manualService,
  });

  // 1. POST /payments/verify — Verify Razorpay payment signature and fulfill order
  app.post(
    "/payments/verify",
    {
      preHandler: ctx.requireAuthenticated,
      schema: {
        operationId: "verifyPayment",
        tags: ["Commerce - Payments"],
        summary: "Verify payment and fulfill order",
        description:
          "Verifies the payment signature returned by Razorpay after checkout, marks the order as paid, and grants course access.",
        body: verifyPaymentRequestSchema,
        response: {
          200: jsonResponse(
            "Payment verified and order fulfilled",
            verifyPaymentResponseSchema,
          ),
          400: errorResponse(
            "Signature invalid, amount mismatch, or order expired",
          ),
          401: errorResponse("Unauthorized"),
          404: errorResponse("Order or payment not found"),
          409: errorResponse("Payment already processed"),
        },
      },
    },
    controller.verifyPayment,
  );

  // 2. POST /orders/:orderId/manual-payment - Submit offline payment details (FR-PAY-011)
  app.post(
    "/orders/:orderId/manual-payment",
    {
      preHandler: ctx.requireAuthenticated,
      schema: {
        operationId: "submitManualPayment",
        tags: ["Commerce - Manual Payments"],
        summary: "Submit offline UPI / bank transfer proof",
        description:
          "Submits transaction reference / UTR for offline payment verification.",
        params: z.object({ orderId: z.uuid() }),
        body: submitManualPaymentRequestSchema,
        response: {
          201: jsonResponse(
            "Manual payment submitted",
            learnerManualPaymentRequestSchema,
          ),
          400: errorResponse("Invalid order or status"),
          401: errorResponse("Unauthorized"),
          404: errorResponse("Order not found"),
          409: errorResponse("Payment already verified"),
        },
      },
    },
    manualController.submitPayment,
  );

  // 2b. POST /orders/:orderId/manual-payment/withdraw - The buyer takes a
  //     reported transfer back while staff have not answered it
  app.post(
    "/orders/:orderId/manual-payment/withdraw",
    {
      preHandler: ctx.requireAuthenticated,
      schema: {
        operationId: "withdrawManualPayment",
        tags: ["Commerce - Manual Payments"],
        summary: "Withdraw a reported transfer that is still being checked",
        description:
          "Takes back the bank or UPI transfer the buyer reported for their own order, while staff have not verified or rejected it. The order can then be paid another way.",
        params: z.object({ orderId: z.uuid() }),
        response: {
          200: jsonResponse(
            "The withdrawn request",
            learnerManualPaymentRequestSchema,
          ),
          401: errorResponse("Unauthorized"),
          404: errorResponse("Order not found"),
          409: errorResponse("No transfer is waiting to be checked"),
        },
      },
    },
    manualController.withdrawPayment,
  );

  // 3. GET /manual-payments/my - List student's manual payments
  app.get(
    "/manual-payments/my",
    {
      preHandler: ctx.requireAuthenticated,
      schema: {
        operationId: "listMyManualPayments",
        tags: ["Commerce - Manual Payments"],
        summary: "List student manual offline payments",
        response: {
          200: jsonResponse(
            "List of manual payment submissions",
            z.array(learnerManualPaymentRequestSchema),
          ),
          401: errorResponse("Unauthorized"),
        },
      },
    },
    manualController.listMyPayments,
  );

  // 4. GET /manual-payments - List all manual payments for review
  app.get(
    "/manual-payments",
    {
      preHandler: ctx.requires("payment.manual.verify"),
      schema: {
        operationId: "listManualPayments",
        tags: ["Commerce - Manual Payments"],
        summary: "List manual payments queue for review",
        querystring: z.object({
          status: manualPaymentStatusSchema.optional(),
        }),
        response: {
          200: jsonResponse(
            "List of manual payment requests",
            z.array(manualPaymentRequestSchema),
          ),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden - Admin required"),
        },
      },
    },
    manualController.listAllPayments,
  );

  // 5. POST /manual-payments/:requestId/verify - Verify and grant audited access
  app.post(
    "/manual-payments/:requestId/verify",
    {
      preHandler: ctx.requires("payment.manual.verify"),
      schema: {
        operationId: "verifyManualPayment",
        tags: ["Commerce - Manual Payments"],
        summary: "Approve or reject offline payment and grant audited access",
        params: z.object({ requestId: z.uuid() }),
        body: verifyManualPaymentRequestSchema,
        response: {
          200: jsonResponse(
            "Manual payment reviewed",
            manualPaymentRequestSchema,
          ),
          400: errorResponse("Invalid request or already resolved"),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden - Admin required"),
          404: errorResponse("Manual payment not found"),
        },
      },
    },
    manualController.verifyPayment,
  );
};

export default paymentRoutes;
