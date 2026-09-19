import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  Coupon,
  CreateCouponRequest,
  UpdateCouponRequest,
} from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { couponKeys } from "./coupons.keys";
import { couponsService } from "./coupons.service";

export function useCreateCoupon() {
  const queryClient = useQueryClient();

  return useMutation<Coupon, ApiError, CreateCouponRequest>({
    mutationFn: (payload) => couponsService.createCoupon(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: couponKeys.lists() });
    },
  });
}

export function useUpdateCoupon() {
  const queryClient = useQueryClient();

  return useMutation<
    Coupon,
    ApiError,
    { id: string; payload: UpdateCouponRequest }
  >({
    mutationFn: ({ id, payload }) =>
      couponsService.updateCoupon(id, payload),
    onSuccess: (updatedCoupon) => {
      queryClient.invalidateQueries({ queryKey: couponKeys.lists() });
      if (updatedCoupon?.id) {
        queryClient.invalidateQueries({
          queryKey: couponKeys.detail(updatedCoupon.id),
        });
      }
    },
  });
}

export function useDeleteCoupon() {
  const queryClient = useQueryClient();

  return useMutation<{ message: string }, ApiError, string>({
    mutationFn: (id) => couponsService.deleteCoupon(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: couponKeys.lists() });
    },
  });
}
