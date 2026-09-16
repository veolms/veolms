import { z } from "zod";
import {
  couponListResponseSchema,
  couponSchema,
  createCouponRequestSchema,
  listCouponsQuerySchema,
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

  app.get(
    "/coupons",
    {
      preHandler: ctx.requireStaff,
      schema: {
        operationId: "listCoupons",
        tags: ["Commerce - Coupons"],
        summary: "List coupons",
        description:
          "Returns academy coupons with cursor pagination. Pass `courseId` to include only coupons that apply to that course.",
        querystring: listCouponsQuerySchema,
        response: {
          200: jsonResponse("List of coupons", couponListResponseSchema),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
        },
      },
    },
    controller.listCoupons,
  );

  app.get(
    "/coupons/:couponId",
    {
      preHandler: ctx.requireStaff,
      schema: {
        operationId: "getCouponById",
        tags: ["Commerce - Coupons"],
        summary: "Get coupon details by ID",
        params: z.object({ couponId: z.uuid() }),
        response: {
          200: jsonResponse("Coupon details", couponSchema),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
          404: errorResponse("Coupon not found"),
        },
      },
    },
    controller.getCoupon,
  );

  app.post(
    "/coupons",
    {
      preHandler: ctx.requireStaff,
      schema: {
        operationId: "createCoupon",
        tags: ["Commerce - Coupons"],
        summary: "Create a new coupon",
        description:
          "Creates a discount coupon with percentage/fixed amount, expiry date, usage limits, and course restrictions.",
        body: createCouponRequestSchema,
        response: {
          200: jsonResponse("Coupon created successfully", couponSchema),
          400: errorResponse("Invalid coupon parameters"),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
          409: errorResponse("Coupon code already exists"),
        },
      },
    },
    controller.createCoupon,
  );

  app.patch(
    "/coupons/:couponId",
    {
      preHandler: ctx.requireStaff,
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
          403: errorResponse("Forbidden"),
          404: errorResponse("Coupon not found"),
        },
      },
    },
    controller.updateCoupon,
  );

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
          409: errorResponse("Coupon has redemptions"),
        },
      },
    },
    controller.deleteCoupon,
  );
};

export default couponRoutes;
