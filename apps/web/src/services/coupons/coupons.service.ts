import { api } from "../../lib/api-client";
import type {
  Coupon,
  CouponListResponse,
  CreateCouponRequest,
  ListCouponsQuery,
  UpdateCouponRequest,
} from "@veolms/contracts";

export const couponsService = {
  listCoupons: (filters?: ListCouponsQuery): Promise<CouponListResponse> => {
    return api.get<CouponListResponse>("/coupons", {
      params: filters,
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
