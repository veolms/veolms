import crypto from "node:crypto";
import type {
  Coupon,
  CreateCouponRequest,
  UpdateCouponRequest,
} from "@veolms/contracts";
import type { Executor } from "../shared/repository.types.ts";
import { AppError } from "../../../lib/errors.ts";
import * as couponRepo from "./coupon.repository.ts";

export interface CouponService {
  listCoupons(): Promise<Coupon[]>;
  getCouponById(id: string): Promise<Coupon>;
  getCouponByCode(code: string): Promise<Coupon>;
  createCoupon(request: CreateCouponRequest): Promise<Coupon>;
  updateCoupon(id: string, request: UpdateCouponRequest): Promise<Coupon>;
  deleteCoupon(id: string): Promise<void>;
}

export function createCouponService({
  database,
}: {
  database: Executor;
}): CouponService {
  function mapToCoupon(
    row: NonNullable<Awaited<ReturnType<typeof couponRepo.findCouponById>>>,
  ): Coupon {
    return {
      id: row.id,
      code: row.code,
      description: row.description,
      discountType: row.discount_type,
      discountValue: row.discount_value,
      maxDiscountAmount: row.max_discount_amount,
      minOrderAmount: row.min_order_amount,
      startsAt: row.starts_at,
      expiresAt: row.expires_at,
      globalUsageLimit: row.global_usage_limit,
      perUserLimit: row.per_user_limit,
      isActive: row.is_active,
      restrictedCourseIds: row.restricted_course_ids,
      restrictedBundleIds: row.restricted_bundle_ids,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async function listCoupons(): Promise<Coupon[]> {
    const list = await couponRepo.listCoupons(database);
    return list.map(mapToCoupon);
  }

  async function getCouponById(id: string): Promise<Coupon> {
    const coupon = await couponRepo.findCouponById(database, id);
    if (!coupon) {
      throw new AppError(404, "COUPON_NOT_FOUND", `Coupon with id "${id}" was not found.`);
    }
    return mapToCoupon(coupon);
  }

  async function getCouponByCode(code: string): Promise<Coupon> {
    const coupon = await couponRepo.findCouponByCode(database, code);
    if (!coupon) {
      throw new AppError(404, "COUPON_NOT_FOUND", `Coupon "${code}" was not found.`);
    }
    return mapToCoupon(coupon);
  }

  async function createCoupon(request: CreateCouponRequest): Promise<Coupon> {
    if (request.discountType === "percentage" && request.discountValue > 100) {
      throw new AppError(400, "INVALID_COUPON_DISCOUNT", "Percentage discount cannot exceed 100%.");
    }

    const existing = await couponRepo.findCouponByCode(database, request.code);
    if (existing) {
      throw new AppError(409, "COUPON_CODE_ALREADY_EXISTS", `Coupon code "${request.code}" already exists.`);
    }

    const now = new Date();
    const created = await couponRepo.insertCoupon(database, {
      id: crypto.randomUUID(),
      code: request.code.toUpperCase(),
      description: request.description ?? null,
      discount_type: request.discountType,
      discount_value: request.discountValue,
      max_discount_amount: request.maxDiscountAmount ?? null,
      min_order_amount: request.minOrderAmount ?? 0,
      starts_at: new Date(request.startsAt),
      expires_at: new Date(request.expiresAt),
      global_usage_limit: request.globalUsageLimit ?? null,
      per_user_limit: request.perUserLimit ?? 1,
      is_active: request.isActive ?? true,
      restricted_course_ids: request.restrictedCourseIds ?? null,
      restricted_bundle_ids: request.restrictedBundleIds ?? null,
      created_at: now,
      updated_at: now,
    });

    return mapToCoupon(created);
  }

  async function updateCoupon(id: string, request: UpdateCouponRequest): Promise<Coupon> {
    const existing = await couponRepo.findCouponById(database, id);
    if (!existing) {
      throw new AppError(404, "COUPON_NOT_FOUND", `Coupon with id "${id}" was not found.`);
    }

    const effectiveDiscountType = request.discountType ?? existing.discount_type;
    const effectiveDiscountValue = request.discountValue ?? existing.discount_value;
    if (effectiveDiscountType === "percentage" && effectiveDiscountValue > 100) {
      throw new AppError(400, "INVALID_COUPON_DISCOUNT", "Percentage discount cannot exceed 100%.");
    }

    const updated = await couponRepo.updateCoupon(database, id, {
      description: request.description,
      discount_type: request.discountType,
      discount_value: request.discountValue,
      max_discount_amount: request.maxDiscountAmount,
      min_order_amount: request.minOrderAmount,
      starts_at: request.startsAt ? new Date(request.startsAt) : undefined,
      expires_at: request.expiresAt ? new Date(request.expiresAt) : undefined,
      global_usage_limit: request.globalUsageLimit,
      per_user_limit: request.perUserLimit,
      is_active: request.isActive,
      restricted_course_ids: request.restrictedCourseIds,
      restricted_bundle_ids: request.restrictedBundleIds,
    });

    if (!updated) {
      throw new AppError(404, "COUPON_NOT_FOUND", `Coupon with id "${id}" was not found.`);
    }

    return mapToCoupon(updated);
  }

  async function deleteCoupon(id: string): Promise<void> {
    const existing = await couponRepo.findCouponById(database, id);
    if (!existing) {
      throw new AppError(404, "COUPON_NOT_FOUND", `Coupon with id "${id}" was not found.`);
    }
    await couponRepo.deleteCoupon(database, id);
  }

  return {
    listCoupons,
    getCouponById,
    getCouponByCode,
    createCoupon,
    updateCoupon,
    deleteCoupon,
  };
}
