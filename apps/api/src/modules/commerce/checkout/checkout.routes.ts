import {
  checkoutPreviewRequestSchema,
  checkoutPreviewResponseSchema,
  createCheckoutOrderRequestSchema,
  createCheckoutOrderResponseSchema,
} from "@veolms/contracts";
import { jsonResponse } from "../../../lib/responses.ts";
import { errorResponse } from "../../../lib/errors.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { createCommerceContext } from "../shared/commerce.context.ts";
import { createCheckoutService } from "./checkout.service.ts";
import { createCheckoutController } from "./checkout.controller.ts";

const checkoutRoutes: RoutePlugin = async (app, options) => {
  const ctx = createCommerceContext(options);
  const service = createCheckoutService({
    database: options.database,
    paymentGateway: options.services.paymentGateway,
  });
  const controller = createCheckoutController({ service });

  // 1. POST /checkout/preview - Calculates authoritative total, items and coupon preview
  app.post(
    "/checkout/preview",
    {
      preHandler: [
        ctx.middleware.authenticate,
        ctx.middleware.requireMfaVerifiedIfAuthenticated,
      ],
      schema: {
        operationId: "previewCheckout",
        tags: ["Commerce - Checkout"],
        summary: "Preview checkout calculations",
        description:
          "Calculates prices, taxes, and coupon discounts for course or bundle items.",
        body: checkoutPreviewRequestSchema,
        response: {
          200: jsonResponse(
            "Calculated checkout preview",
            checkoutPreviewResponseSchema,
          ),
          400: errorResponse("Invalid items or coupon"),
          404: errorResponse("Item not found"),
          409: errorResponse("Item already owned"),
          403: errorResponse("MFA step-up required."),
        },
      },
    },
    controller.previewCheckout,
  );

  // 2. POST /checkout/orders - Creates internal order, items snapshots, and initializes payment
  app.post(
    "/checkout/orders",
    {
      preHandler: ctx.requireAuthenticated,
      schema: {
        operationId: "createCheckoutOrder",
        tags: ["Commerce - Checkout"],
        summary: "Create order and initialize payment",
        description:
          "Creates an internal  order, records item price snapshots, and initializes the upstream payment order.",
        body: createCheckoutOrderRequestSchema,
        response: {
          200: jsonResponse(
            "Order created and payment initialized",
            createCheckoutOrderResponseSchema,
          ),
          400: errorResponse("Invalid checkout request"),
          401: errorResponse("Unauthorized"),
          404: errorResponse("Item not found"),
          409: errorResponse("Item already owned or payment in progress"),
        },
      },
    },
    controller.createOrder,
  );
};

export default checkoutRoutes;
