import { api } from "../../lib/api-client";
import type {
  Coupon,
  CreateCouponRequest,
  UpdateCouponRequest,
} from "@veolms/contracts";

export const couponsService = {
  listCoupons: (filters?: { courseId?: string }): Promise<Coupon[]> => {
    return api.get<Coupon[]>("/coupons", {
      params: filters?.courseId ? { courseId: filters.courseId } : undefined,
    });
  },

  getCouponById: (id: string): Promise<Coupon> => {
    return api.get<Coupon>(`/coupons/${id}`);
  },

  createCoupon: (payload: CreateCouponRequest): Promise<Coupon> => {
    return api.post<Coupon>("/coupons", payload);
  },

  updateCoupon: (
    id: string,
    payload: UpdateCouponRequest,
  ): Promise<Coupon> => {
    return api.patch<Coupon>(`/coupons/${id}`, payload);
  },

  deleteCoupon: (id: string): Promise<{ message: string }> => {
    return api.delete<{ message: string }>(`/coupons/${id}`);
  },
};
