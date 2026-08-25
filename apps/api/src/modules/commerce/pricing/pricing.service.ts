import type { CartItemInput, PricingCalculation, CouponValidationResult } from "@veolms/contracts";
import type { Executor } from "../shared/repository.types.ts";
import { CommerceErrors } from "../shared/commerce.errors.ts";
import * as courseRepo from "../../courses/course/course.repository.ts";
import * as courseConfigRepo from "../../courses/configuration/configuration.repository.ts";
import * as bundleRepo from "../bundles/bundle.repository.ts";
import * as couponRepo from "../coupons/coupon.repository.ts";
import * as enrollmentRepo from "../enrollments/enrollment.repository.ts";

export interface CalculatePricingParams {
  userId?: string | null;
  items: CartItemInput[];
  couponCode?: string | null;
  /** Optional date override for deterministic testing */
  now?: Date;
}

export interface PricingService {
  calculatePricing(params: CalculatePricingParams): Promise<{
    pricing: PricingCalculation;
    couponValidation?: CouponValidationResult;
  }>;
}

export function createPricingService({
  database,
}: {
  database: Executor;
}): PricingService {
  /**
   * Deterministically calculates live pricing for courses/bundles, checks enrollment eligibility,
   * validates coupon restrictions and applies discounts in minor currency units (paise).
   */
  async function calculatePricing(params: CalculatePricingParams) {
    const now = params.now ?? new Date();
    const { userId, items, couponCode } = params;

    if (!items || items.length === 0) {
      throw CommerceErrors.EMPTY_CHECKOUT_ITEMS();
    }

    // 1. Fetch user enrollments if authenticated to prevent duplicate ownership
    const enrolledCourseIds = userId
      ? new Set(await enrollmentRepo.listUserEnrolledCourseIds(database, userId))
      : new Set<string>();

    const calculatedItems: Array<{
      itemType: "course" | "bundle";
      itemId: string;
      title: string;
      unitPrice: number;
      discountAmount: number;
      taxAmount: number;
      finalAmount: number;
    }> = [];

    let subtotalAmount = 0;
    const itemCourseMap = new Map<string, string[]>(); // itemId -> included course IDs

    // 2. Authoritatively resolve every item from DB (courses / bundles)
    for (const item of items) {
      if (item.itemType === "course") {
        const courseId = item.courseId!;
        const course = await courseRepo.findCourseById(database as any, courseId);
        if (!course) {
          throw CommerceErrors.COURSE_NOT_FOUND(courseId);
        }
        if (course.status !== "published") {
          throw CommerceErrors.COURSE_NOT_AVAILABLE(course.title);
        }
        if (enrolledCourseIds.has(courseId)) {
          throw CommerceErrors.COURSE_ALREADY_OWNED(course.title);
        }

        // Fetch live pricing
        const pricing = await courseConfigRepo.findPricingByCourseId(database as any, courseId);
        let unitPrice = 0;
        if (pricing && pricing.pricing_type === "paid") {
          const isSaleActive =
            pricing.sale_price !== null &&
            pricing.sale_price !== undefined &&
            (!pricing.sale_starts_at || new Date(pricing.sale_starts_at) <= now) &&
            (!pricing.sale_ends_at || new Date(pricing.sale_ends_at) >= now);

          unitPrice = isSaleActive && pricing.sale_price !== null ? pricing.sale_price : pricing.price;
        }

        calculatedItems.push({
          itemType: "course",
          itemId: courseId,
          title: course.title,
          unitPrice,
          discountAmount: 0,
          taxAmount: 0,
          finalAmount: unitPrice,
        });
        subtotalAmount += unitPrice;
        itemCourseMap.set(courseId, [courseId]);
      } else if (item.itemType === "bundle") {
        const bundleId = item.bundleId!;
        const bundle = await bundleRepo.findBundleById(database, bundleId);
        if (!bundle) {
          throw CommerceErrors.BUNDLE_NOT_FOUND(bundleId);
        }
        if (bundle.status !== "published") {
          throw CommerceErrors.BUNDLE_NOT_AVAILABLE(bundle.title);
        }

        const bundleCourses = await bundleRepo.listBundleCourses(database, bundleId);
        const bundleCourseIds = bundleCourses.map((c) => c.course_id);

        // Check if student already owns ALL courses in bundle
        const allOwned =
          bundleCourseIds.length > 0 &&
          bundleCourseIds.every((cid) => enrolledCourseIds.has(cid));

        if (allOwned) {
          throw CommerceErrors.BUNDLE_ALL_COURSES_OWNED(bundle.title);
        }

        const unitPrice = bundle.price;
        calculatedItems.push({
          itemType: "bundle",
          itemId: bundleId,
          title: bundle.title,
          unitPrice,
          discountAmount: 0,
          taxAmount: 0,
          finalAmount: unitPrice,
        });
        subtotalAmount += unitPrice;
        itemCourseMap.set(bundleId, bundleCourseIds);
      }
    }

    // 3. Process Coupon if provided
    let totalDiscount = 0;
    let couponValidation: CouponValidationResult | undefined;
    let couponId: string | undefined;

    if (couponCode && couponCode.trim()) {
      const codeUpper = couponCode.trim().toUpperCase();
      const coupon = await couponRepo.findCouponByCode(database, codeUpper);

      if (!coupon) {
        throw CommerceErrors.INVALID_COUPON(codeUpper);
      }
      if (!coupon.is_active) {
        throw CommerceErrors.COUPON_INACTIVE(codeUpper);
      }
      if (new Date(coupon.starts_at) > now) {
        throw CommerceErrors.COUPON_NOT_STARTED(codeUpper);
      }
      if (new Date(coupon.expires_at) < now) {
        throw CommerceErrors.COUPON_EXPIRED(codeUpper);
      }
      if (subtotalAmount < coupon.min_order_amount) {
        throw CommerceErrors.COUPON_MIN_ORDER_NOT_MET(codeUpper, coupon.min_order_amount);
      }

      // Check global limit
      if (coupon.global_usage_limit !== null && coupon.global_usage_limit !== undefined) {
        const globalUsed = await couponRepo.countCouponRedemptionsGlobal(database, coupon.id);
        if (globalUsed >= coupon.global_usage_limit) {
          throw CommerceErrors.COUPON_USAGE_LIMIT_REACHED(codeUpper);
        }
      }

      // Check per-user limit
      if (userId && coupon.per_user_limit) {
        const userUsed = await couponRepo.countCouponRedemptionsByUser(database, coupon.id, userId);
        if (userUsed >= coupon.per_user_limit) {
          throw CommerceErrors.COUPON_USER_LIMIT_REACHED(codeUpper);
        }
      }

      // Check item restrictions (course/bundle eligibility)
      let eligibleSubtotal = 0;
      const eligibleItems: typeof calculatedItems = [];

      for (const item of calculatedItems) {
        let isEligible = true;
        if (coupon.restricted_course_ids && coupon.restricted_course_ids.length > 0) {
          const restricted = new Set(coupon.restricted_course_ids);
          if (item.itemType === "course" && !restricted.has(item.itemId)) {
            isEligible = false;
          }
        }
        if (coupon.restricted_bundle_ids && coupon.restricted_bundle_ids.length > 0) {
          const restricted = new Set(coupon.restricted_bundle_ids);
          if (item.itemType === "bundle" && !restricted.has(item.itemId)) {
            isEligible = false;
          }
        }

        if (isEligible) {
          eligibleSubtotal += item.unitPrice;
          eligibleItems.push(item);
        }
      }

      if (eligibleSubtotal === 0) {
        throw CommerceErrors.COUPON_NOT_APPLICABLE(codeUpper);
      }

      // Calculate discount amount
      if (coupon.discount_type === "percentage") {
        const calculatedDiscount = Math.floor((eligibleSubtotal * coupon.discount_value) / 100);
        totalDiscount = coupon.max_discount_amount
          ? Math.min(calculatedDiscount, coupon.max_discount_amount)
          : calculatedDiscount;
      } else {
        // fixed discount
        totalDiscount = Math.min(coupon.discount_value, eligibleSubtotal);
      }

      // Cap discount at eligible subtotal
      totalDiscount = Math.min(totalDiscount, eligibleSubtotal);

      // Allocate proportional discount among eligible items
      let remainingDiscountToDistribute = totalDiscount;
      for (let i = 0; i < eligibleItems.length; i++) {
        const it = eligibleItems[i]!;
        if (i === eligibleItems.length - 1) {
          it.discountAmount = remainingDiscountToDistribute;
        } else {
          const itemDiscount = Math.floor((it.unitPrice / eligibleSubtotal) * totalDiscount);
          it.discountAmount = itemDiscount;
          remainingDiscountToDistribute -= itemDiscount;
        }
        it.finalAmount = Math.max(0, it.unitPrice - it.discountAmount);
      }

      couponId = coupon.id;
      couponValidation = {
        valid: true,
        code: coupon.code,
        discountType: coupon.discount_type,
        discountValue: coupon.discount_value,
        discountAmount: totalDiscount,
        message: `${coupon.discount_type === "percentage" ? `${coupon.discount_value}%` : `₹${coupon.discount_value / 100}`} discount applied.`,
      };
    }

    const totalTax = 0; // Configurable tax if needed in future
    const totalAmount = Math.max(0, subtotalAmount - totalDiscount + totalTax);

    const pricing: PricingCalculation = {
      subtotalAmount,
      discountAmount: totalDiscount,
      taxAmount: totalTax,
      totalAmount,
      currency: "INR",
      couponCode: couponValidation?.code,
      couponId,
      items: calculatedItems,
    };

    return {
      pricing,
      couponValidation,
    };
  }

  return {
    calculatePricing,
  };
}
