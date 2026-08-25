import {
  verifyPaymentRequestSchema,
  verifyPaymentResponseSchema,
} from "@veolms/contracts";
import { jsonResponse } from "../../../lib/responses.ts";
import { errorResponse } from "../../../lib/errors.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { createCommerceContext } from "../shared/commerce.context.ts";
import { createPaymentService } from "./payment.service.ts";
import { createPaymentController } from "./payment.controller.ts";

const paymentRoutes: RoutePlugin = async (app, options) => {
  const ctx = createCommerceContext(options);
  const service = createPaymentService({
    database: options.database,
    paymentGateway: options.services.paymentGateway,
  });
  const controller = createPaymentController({ service });

  // POST /payments/verify — Verify Razorpay payment signature and fulfill order
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
          200: jsonResponse("Payment verified and order fulfilled", verifyPaymentResponseSchema),
          400: errorResponse("Signature invalid, amount mismatch, or order expired"),
          401: errorResponse("Unauthorized"),
          404: errorResponse("Order or payment not found"),
          409: errorResponse("Payment already processed"),
        },
      },
    },
    controller.verifyPayment,
  );
};

export default paymentRoutes;
