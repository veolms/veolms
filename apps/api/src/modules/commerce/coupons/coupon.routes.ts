import { z } from "zod";
import {
  couponSchema,
  createCouponRequestSchema,
  updateCouponRequestSchema,
} from "@veolms/contracts";
import { jsonResponse } from "../../../lib/responses.ts";
import { errorResponse } from "../../../lib/errors.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { createCommerceContext } from "../shared/commerce.context.ts";
import { createCouponService } from "./coupon.service.ts";
import { createCouponController } from "./coupon.controller.ts";

const couponRoutes: RoutePlugin = async (app, options) => {
  const ctx = createCommerceContext(options);
  const service = createCouponService({ database: options.database });
  const controller = createCouponController({ service });

  // 1. GET /coupons - List all coupons
  app.get(
    "/coupons",
    {
      preHandler: ctx.requireAdmin,
      schema: {
        operationId: "listCoupons",
        tags: ["Commerce - Coupons"],
        summary: "List all coupons",
        description: "Returns all active, expired, and disabled coupon codes for the academy.",
        response: {
          200: jsonResponse("List of coupons", z.array(couponSchema)),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden - Admin required"),
        },
      },
    },
    controller.listCoupons,
  );

  // 2. GET /coupons/:couponId - Get coupon by ID
  app.get(
    "/coupons/:couponId",
    {
      preHandler: ctx.requireAdmin,
      schema: {
        operationId: "getCouponById",
        tags: ["Commerce - Coupons"],
        summary: "Get coupon details by ID",
        params: z.object({ couponId: z.uuid() }),
        response: {
          200: jsonResponse("Coupon details", couponSchema),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden - Admin required"),
          404: errorResponse("Coupon not found"),
        },
      },
    },
    controller.getCoupon,
  );

  // 3. POST /coupons - Create new coupon
  app.post(
    "/coupons",
    {
      preHandler: ctx.requireAdmin,
      schema: {
        operationId: "createCoupon",
        tags: ["Commerce - Coupons"],
        summary: "Create a new coupon",
        description: "Creates a discount coupon with percentage/fixed amount, expiry date, usage limits, and course restrictions.",
        body: createCouponRequestSchema,
        response: {
          200: jsonResponse("Coupon created successfully", couponSchema),
          400: errorResponse("Invalid coupon parameters"),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden - Admin required"),
          409: errorResponse("Coupon code already exists"),
        },
      },
    },
    controller.createCoupon,
  );

  // 4. PATCH /coupons/:couponId - Update coupon
  app.patch(
    "/coupons/:couponId",
    {
      preHandler: ctx.requireAdmin,
      schema: {
        operationId: "updateCoupon",
        tags: ["Commerce - Coupons"],
        summary: "Update an existing coupon",
        params: z.object({ couponId: z.uuid() }),
        body: updateCouponRequestSchema,
        response: {
          200: jsonResponse("Coupon updated successfully", couponSchema),
          400: errorResponse("Invalid update parameters"),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden - Admin required"),
          404: errorResponse("Coupon not found"),
        },
      },
    },
    controller.updateCoupon,
  );

  // 5. DELETE /coupons/:couponId - Delete coupon
  app.delete(
    "/coupons/:couponId",
    {
      preHandler: ctx.requireAdmin,
      schema: {
        operationId: "deleteCoupon",
        tags: ["Commerce - Coupons"],
        summary: "Delete a coupon",
        params: z.object({ couponId: z.uuid() }),
        response: {
          200: jsonResponse(
            "Coupon deleted successfully",
            z.object({ message: z.string() }),
          ),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden - Admin required"),
          404: errorResponse("Coupon not found"),
        },
      },
    },
    controller.deleteCoupon,
  );
};

export default couponRoutes;
