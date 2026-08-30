import type { FastifyRequest, FastifyReply } from "fastify";
import type {
  CreateCouponRequest,
  UpdateCouponRequest,
} from "@veolms/contracts";
import type { CouponService } from "./coupon.service.ts";

export function createCouponController({
  service,
}: {
  service: CouponService;
}) {
  async function listCoupons() {
    return await service.listCoupons();
  }

  async function getCoupon(
    request: FastifyRequest<{ Params: { couponId: string } }>,
  ) {
    return await service.getCouponById(request.params.couponId);
  }

  async function createCoupon(
    request: FastifyRequest<{ Body: CreateCouponRequest }>,
  ) {
    return await service.createCoupon(request.body);
  }

  async function updateCoupon(
    request: FastifyRequest<{
      Params: { couponId: string };
      Body: UpdateCouponRequest;
    }>,
  ) {
    return await service.updateCoupon(request.params.couponId, request.body);
  }

  async function deleteCoupon(
    request: FastifyRequest<{ Params: { couponId: string } }>,
  ) {
    await service.deleteCoupon(request.params.couponId);
    return { message: "Coupon deleted successfully." };
  }

  return {
    listCoupons,
    getCoupon,
    createCoupon,
    updateCoupon,
    deleteCoupon,
  };
}
