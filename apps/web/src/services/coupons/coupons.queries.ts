import { useQuery } from "@tanstack/react-query";
import type { Coupon } from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { couponKeys } from "./coupons.keys";
import { couponsService } from "./coupons.service";

export function useCouponsList(courseId?: string | null) {
  return useQuery<Coupon[], ApiError>({
    queryKey: couponKeys.list(courseId ? { courseId } : undefined),
    queryFn: () =>
      couponsService.listCoupons(courseId ? { courseId } : undefined),
    refetchInterval: 30_000,
  });
}

export function useCouponById(id: string | null | undefined) {
  return useQuery<Coupon, ApiError>({
    queryKey: couponKeys.detail(id ?? ""),
    queryFn: () => couponsService.getCouponById(id!),
    enabled: Boolean(id),
  });
}
