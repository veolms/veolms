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

    let detectedCurrency = "INR";
    let currencyInitialized = false;

    // 2. Authoritatively resolve every item from DB (courses / bundles).
    //    Batched up front — one query per repo function instead of one per
    //    cart item — since this runs on every GET /cart, checkout preview,
    //    and order-creation call (the module's hottest paths). The
    //    validation loop below is otherwise unchanged: same checks, same
    //    order, same first-invalid-item-throws semantics — it just reads
    //    from these pre-fetched Maps instead of awaiting a query per item.
    const courseIds = [
      ...new Set(items.filter((it) => it.itemType === "course").map((it) => it.courseId!)),
    ];
    const bundleIds = [
      ...new Set(items.filter((it) => it.itemType === "bundle").map((it) => it.bundleId!)),
    ];

    const [courseRows, pricingRows, bundleRows, bundleCourseRows] = await Promise.all([
      courseRepo.findCoursesByIds(database, courseIds),
      courseConfigRepo.findPricingByCourseIds(database, courseIds),
      bundleRepo.findBundlesByIds(database, bundleIds),
      bundleRepo.listBundleCoursesForBundleIds(database, bundleIds),
    ]);

    const coursesById = new Map(courseRows.map((c) => [c.id, c]));
    const pricingByCourseId = new Map(pricingRows.map((p) => [p.course_id, p]));
    const bundlesById = new Map(bundleRows.map((b) => [b.id, b]));
    const bundleCoursesByBundleId = new Map<string, typeof bundleCourseRows>();
    for (const bc of bundleCourseRows) {
      const list = bundleCoursesByBundleId.get(bc.bundle_id) ?? [];
      list.push(bc);
      bundleCoursesByBundleId.set(bc.bundle_id, list);
    }

    for (const item of items) {
      if (item.itemType === "course") {
        const courseId = item.courseId!;
        const course = coursesById.get(courseId);
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
        const pricing = pricingByCourseId.get(courseId);
        let unitPrice = 0;
        if (pricing && pricing.pricing_type === "paid") {
          const isSaleActive =
            pricing.sale_price !== null &&
            pricing.sale_price !== undefined;

          unitPrice = isSaleActive && pricing.sale_price !== null ? pricing.sale_price : pricing.price;

          const itemCurrency = (pricing as any).currency ?? "INR";
          if (!currencyInitialized) {
            detectedCurrency = itemCurrency;
            currencyInitialized = true;
          } else if (itemCurrency !== detectedCurrency && unitPrice > 0) {
            throw CommerceErrors.PRICE_CALCULATION_FAILED(
              `Cart contains items with mixed currencies (${detectedCurrency} and ${itemCurrency}).`,
            );
          }
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
        const bundle = bundlesById.get(bundleId);
        if (!bundle) {
          throw CommerceErrors.BUNDLE_NOT_FOUND(bundleId);
        }
        if (bundle.status !== "published") {
          throw CommerceErrors.BUNDLE_NOT_AVAILABLE(bundle.title);
        }

        const bundleCourses = bundleCoursesByBundleId.get(bundleId) ?? [];
        const bundleCourseIds = bundleCourses.map((c) => c.course_id);

        // Check if student already owns ALL courses in bundle
        const allOwned =
          bundleCourseIds.length > 0 &&
          bundleCourseIds.every((cid) => enrolledCourseIds.has(cid));

        if (allOwned) {
          throw CommerceErrors.BUNDLE_ALL_COURSES_OWNED(bundle.title);
        }

        const unitPrice = bundle.price;
        const itemCurrency = bundle.currency ?? "INR";
        if (!currencyInitialized) {
          detectedCurrency = itemCurrency;
          currencyInitialized = true;
        } else if (itemCurrency !== detectedCurrency && unitPrice > 0) {
          throw CommerceErrors.PRICE_CALCULATION_FAILED(
            `Cart contains items with mixed currencies (${detectedCurrency} and ${itemCurrency}).`,
          );
        }

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
      currency: detectedCurrency,
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
