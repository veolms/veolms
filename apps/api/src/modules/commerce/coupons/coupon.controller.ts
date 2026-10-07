import type { FastifyRequest } from "fastify";
import type {
  CreateCouponRequest,
  ListCouponsQuery,
  UpdateCouponRequest,
} from "@veolms/contracts";
import type { CouponService } from "./coupon.service.ts";

// Every coupon route runs behind requireStaff/requireAdmin, so the user is
// always present here.
const actorOf = (request: FastifyRequest) => ({
  id: request.user!.id,
  roles: request.user!.roles,
});

export function createCouponController({
  service,
}: {
  service: CouponService;
}) {
  async function listCoupons(
    request: FastifyRequest<{ Querystring: ListCouponsQuery }>,
  ) {
    return await service.listCoupons(actorOf(request), request.query);
  }

  async function getCoupon(
    request: FastifyRequest<{ Params: { couponId: string } }>,
  ) {
    return await service.getCouponById(
      actorOf(request),
      request.params.couponId,
    );
  }

  async function createCoupon(
    request: FastifyRequest<{ Body: CreateCouponRequest }>,
  ) {
    return await service.createCoupon(actorOf(request), request.body);
  }

  async function updateCoupon(
    request: FastifyRequest<{
      Params: { couponId: string };
      Body: UpdateCouponRequest;
    }>,
  ) {
    return await service.updateCoupon(
      actorOf(request),
      request.params.couponId,
      request.body,
    );
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
