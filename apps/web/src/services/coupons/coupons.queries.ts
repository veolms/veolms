import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { Coupon, CouponListResponse } from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { couponKeys } from "./coupons.keys";
import { couponsService } from "./coupons.service";

export function useCouponsList(options?: {
  courseId?: string | null;
  limit?: number;
  enabled?: boolean;
}) {
  const limit = options?.limit ?? 30;
  const courseId = options?.courseId ?? undefined;
  const enabled = options?.enabled ?? true;

  return useInfiniteQuery<CouponListResponse, ApiError>({
    queryKey: couponKeys.list({ courseId, limit }),
    queryFn: ({ pageParam }) =>
      couponsService.listCoupons({
        courseId,
        cursor: pageParam as string | undefined,
        limit,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 30 * 1000,
    refetchInterval: 30_000,
    enabled,
  });
}

export function useCouponById(id: string | null | undefined) {
  return useQuery<Coupon, ApiError>({
    queryKey: couponKeys.detail(id ?? ""),
    queryFn: () => couponsService.getCouponById(id!),
    enabled: Boolean(id),
  });
}
