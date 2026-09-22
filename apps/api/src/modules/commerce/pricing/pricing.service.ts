import type {
  CartItemInput,
  PricingCalculation,
  CouponValidationResult,
} from "@veolms/contracts";
import type { Executor } from "../shared/repository.types.ts";
import { CommerceErrors } from "../shared/commerce.errors.ts";
import * as quizRepo from "../../quizzes/shared/quiz.repository.ts";
import * as quizPricingRepo from "../../quizzes/shared/quiz-pricing.repository.ts";
import * as courseRepo from "../../courses/course/course.repository.ts";
import * as courseConfigRepo from "../../courses/configuration/configuration.repository.ts";
import * as bundleRepo from "../bundles/bundle.repository.ts";
import * as couponRepo from "../coupons/coupon.repository.ts";
import * as enrollmentRepo from "../enrollments/enrollment.repository.ts";
import {
  computeCouponDiscount,
  resolveCourseCharge,
} from "./pricing.amount.ts";
import { resolveQuizCharge } from "./quiz-pricing.amount.ts";

export interface CalculatePricingParams {
  userId?: string | null;
  items: CartItemInput[];
  couponCode?: string | null;
  /** Optional date override for deterministic testing */
  now?: Date;
}

export interface QuizPricingResult {
  quizAssignmentId: string;
  quizId: string;
  /** Null while the course has no quiz pricing row, i.e. its quizzes are free. */
  quizPricingId: string | null;
  quizTitle: string;
  courseId: string;
  lessonId: string;
  pricingType: "free" | "paid";
  catalogPrice: number;
  salePrice: number | null;
  effectivePrice: number;
  currency: string;
  /** True when the student may attempt without buying: free quizzes, or a paid course quiz pass they hold. */
  isEnrolled: boolean;
}

export interface PricingService {
  calculatePricing(params: CalculatePricingParams): Promise<{
    pricing: PricingCalculation;
    couponValidation?: CouponValidationResult;
  }>;
  calculateQuizPricing(params: {
    userId?: string | null;
    quizAssignmentId: string;
    /** When given, the assignment must belong to this course. */
    courseId?: string;
    /** Admins and the course creator can preview and attempt without buying. */
    isAdmin?: boolean;
    now?: Date;
  }): Promise<QuizPricingResult>;
}

export function createPricingService({
  database,
}: {
  database: Executor;
}): PricingService {
  async function calculateQuizPricing(params: {
    userId?: string | null;
    quizAssignmentId: string;
    courseId?: string;
    isAdmin?: boolean;
    now?: Date;
  }): Promise<QuizPricingResult> {
    const now = params.now ?? new Date();
    const offering = await quizPricingRepo.findOfferingByAssignmentId(
      database,
      params.quizAssignmentId,
    );
    if (
      !offering ||
      (params.courseId && offering.course_id !== params.courseId)
    ) {
      throw CommerceErrors.QUIZ_NOT_FOUND(params.quizAssignmentId);
    }
    // Unpublished courses are only visible to their creator and admins.
    const isPrivileged =
      Boolean(params.isAdmin) ||
      (Boolean(params.userId) && offering.course_creator_id === params.userId);
    if (offering.course_status !== "published" && !isPrivileged) {
      throw CommerceErrors.QUIZ_NOT_FOUND(params.quizAssignmentId);
    }
    const charge = resolveQuizCharge(quizPricingRepo.toPricingRow(offering));

    // Free quizzes and quizzes on a free-preview lesson need no purchase. Paid
    // quizzes need the course's quiz pass; one purchase unlocks every quiz in
    // the course.
    const isFreePreview = Boolean(offering.lesson_is_preview);
    let isEnrolled = !charge.isPaid || isFreePreview || isPrivileged;
    if (charge.isPaid && !isEnrolled && params.userId) {
      isEnrolled = Boolean(
        await quizPricingRepo.findActiveGrant(database, {
          userId: params.userId,
          courseId: offering.course_id,
          now,
        }),
      );
    }

    return {
      quizAssignmentId: offering.assignment_id,
      quizId: offering.quiz_id,
      quizPricingId: offering.pricing_id,
      quizTitle: offering.quiz_title,
      courseId: offering.course_id,
      lessonId: offering.lesson_id,
      pricingType: charge.isPaid ? "paid" : "free",
      catalogPrice: charge.catalogPrice,
      salePrice: charge.salePrice,
      effectivePrice: charge.effectivePrice,
      currency: offering.currency ?? "INR",
      isEnrolled,
    };
  }

  /**
   * Deterministically calculates live pricing for courses/bundles/quizzes, checks enrollment eligibility,
   * validates coupon restrictions and applies discounts in whole major currency units.
   */
  async function calculatePricing(params: CalculatePricingParams) {
    const now = params.now ?? new Date();
    const { userId, items, couponCode } = params;

    if (!items || items.length === 0) {
      throw CommerceErrors.EMPTY_CHECKOUT_ITEMS();
    }

    // 1. Fetch user enrollments if authenticated to prevent duplicate ownership
    const enrolledCourseIds = userId
      ? new Set(
          await enrollmentRepo.listUserEnrolledCourseIds(database, userId),
        )
      : new Set<string>();

    const calculatedItems: Array<{
      itemType: "course" | "bundle" | "quiz";
      itemId: string;
      title: string;
      unitPrice: number;
      /** Catalog amount coupons may discount. Excludes voluntary tips. */
      couponBase: number;
      discountAmount: number;
      taxAmount: number;
      finalAmount: number;
    }> = [];

    let subtotalAmount = 0;
    const itemCourseMap = new Map<string, string[]>(); // itemId -> included course IDs

    let detectedCurrency = "INR";
    let currencyInitialized = false;

    // 2. Authoritatively resolve every item from DB (courses / bundles / quizzes).
    const courseIds = [
      ...new Set(
        items
          .filter((it) => it.itemType === "course")
          .map((it) => it.courseId!),
      ),
    ];
    const bundleIds = [
      ...new Set(
        items
          .filter((it) => it.itemType === "bundle")
          .map((it) => it.bundleId!),
      ),
    ];
    const quizPricingIds: string[] = [];
    const seenQuizPricingIds = new Set<string>();
    for (const it of items) {
      if (it.itemType === "quiz" && it.quizPricingId) {
        if (seenQuizPricingIds.has(it.quizPricingId)) {
          throw CommerceErrors.PRICE_CALCULATION_FAILED(
            `Duplicate quiz pricing ID: "${it.quizPricingId}".`,
          );
        }
        seenQuizPricingIds.add(it.quizPricingId);
        quizPricingIds.push(it.quizPricingId);
      }
    }

    const [courseRows, pricingRows, bundleRows, bundleCourseRows, quizRows] =
      await Promise.all([
        courseRepo.findCoursesByIds(database, courseIds),
        courseConfigRepo.findPricingByCourseIds(database, courseIds),
        bundleRepo.findBundlesByIds(database, bundleIds),
        bundleRepo.listBundleCoursesForBundleIds(database, bundleIds),
        quizPricingRepo.listOfferingsByPricingIds(database, quizPricingIds),
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
    const quizzesByPricingId = new Map(
      quizRows.map((q) => [q.pricing_id, q]),
    );

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

        const pricing = pricingByCourseId.get(courseId);
        const isPaidCourse = Boolean(
          pricing && pricing.pricing_type === "paid",
        );
        const catalogPrice =
          isPaidCourse && pricing
            ? pricing.sale_price !== null && pricing.sale_price !== undefined
              ? pricing.sale_price
              : pricing.price
            : 0;
        const itemCurrency = pricing?.currency ?? "INR";
        const { unitPrice, couponBase } = resolveCourseCharge({
          isPaidCourse,
          catalogPrice,
          customAmount: item.customAmount,
          currency: itemCurrency,
        });

        if (!currencyInitialized) {
          detectedCurrency = itemCurrency;
          currencyInitialized = true;
        } else if (itemCurrency !== detectedCurrency && unitPrice > 0) {
          throw CommerceErrors.PRICE_CALCULATION_FAILED(
            `Cart contains items with mixed currencies (${detectedCurrency} and ${itemCurrency}).`,
          );
        }

        calculatedItems.push({
          itemType: "course",
          itemId: courseId,
          title: course.title,
          unitPrice,
          couponBase,
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
          couponBase: unitPrice,
          discountAmount: 0,
          taxAmount: 0,
          finalAmount: unitPrice,
        });
        subtotalAmount += unitPrice;
        itemCourseMap.set(bundleId, bundleCourseIds);
      } else if (item.itemType === "quiz") {
        const quizPricingId = item.quizPricingId!;
        const offering = quizzesByPricingId.get(quizPricingId);
        if (!offering) {
          throw CommerceErrors.QUIZ_NOT_FOUND(quizPricingId);
        }
        const passTitle = `Quiz pass: ${offering.course_title}`;
        if (offering.course_status !== "published") {
          throw CommerceErrors.QUIZ_NOT_AVAILABLE(passTitle);
        }
        const charge = resolveQuizCharge(offering);
        if (!charge.isPaid) {
          throw CommerceErrors.QUIZ_NOT_PURCHASABLE(passTitle);
        }

        if (userId) {
          // One grant per (user, course) unlocks every quiz in the course.
          const hasGrant = await quizPricingRepo.findActiveGrant(database, {
            userId,
            courseId: offering.course_id,
            now,
          });
          if (hasGrant) {
            throw CommerceErrors.QUIZ_ALREADY_OWNED(passTitle);
          }
          const hasCourseAccess =
            enrolledCourseIds.has(offering.course_id) ||
            (await quizRepo.isPublishedFreeCourse(
              database,
              offering.course_id,
            ));
          if (!hasCourseAccess) {
            throw CommerceErrors.QUIZ_COURSE_ACCESS_REQUIRED(
              offering.course_title,
            );
          }
        }

        const itemCurrency = offering.currency ?? "INR";
        if (!currencyInitialized) {
          detectedCurrency = itemCurrency;
          currencyInitialized = true;
        } else if (itemCurrency !== detectedCurrency) {
          throw CommerceErrors.PRICE_CALCULATION_FAILED(
            `Cart contains items with mixed currencies (${detectedCurrency} and ${itemCurrency}).`,
          );
        }

        calculatedItems.push({
          itemType: "quiz",
          itemId: quizPricingId,
          title: passTitle,
          unitPrice: charge.effectivePrice,
          couponBase: 0, // quizzes are not coupon-eligible
          discountAmount: 0,
          taxAmount: 0,
          finalAmount: charge.effectivePrice,
        });
        subtotalAmount += charge.effectivePrice;
        itemCourseMap.set(quizPricingId, [offering.course_id]);
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
      const catalogSubtotal = calculatedItems.reduce(
        (sum, it) => sum + it.couponBase,
        0,
      );
      if (catalogSubtotal < coupon.min_order_amount) {
        throw CommerceErrors.COUPON_MIN_ORDER_NOT_MET(
          codeUpper,
          coupon.min_order_amount,
        );
      }

      // Check global limit
      if (
        coupon.global_usage_limit !== null &&
        coupon.global_usage_limit !== undefined
      ) {
        const globalUsed = await couponRepo.countCouponRedemptionsGlobal(
          database,
          coupon.id,
        );
        if (globalUsed >= coupon.global_usage_limit) {
          throw CommerceErrors.COUPON_USAGE_LIMIT_REACHED(codeUpper);
        }
      }

      // Check per-user limit
      if (userId && coupon.per_user_limit) {
        const userUsed = await couponRepo.countCouponRedemptionsByUser(
          database,
          coupon.id,
          userId,
        );
        if (userUsed >= coupon.per_user_limit) {
          throw CommerceErrors.COUPON_USER_LIMIT_REACHED(codeUpper);
        }
      }

      // Check item restrictions (course/bundle eligibility)
      let eligibleSubtotal = 0;
      const eligibleItems: typeof calculatedItems = [];

      for (const item of calculatedItems) {
        // Quizzes are always charged at their configured price; coupons skip them.
        if (item.itemType === "quiz") continue;
        let isEligible = true;
        if (item.itemType === "course") {
          const p = pricingByCourseId.get(item.itemId);
          if (!p || p.pricing_type !== "paid" || item.couponBase <= 0) {
            isEligible = false;
          }
        }
        if (
          coupon.restricted_course_ids &&
          coupon.restricted_course_ids.length > 0
        ) {
          const restricted = new Set(coupon.restricted_course_ids);
          if (item.itemType === "course" && !restricted.has(item.itemId)) {
            isEligible = false;
          }
        }
        if (
          coupon.restricted_bundle_ids &&
          coupon.restricted_bundle_ids.length > 0
        ) {
          const restricted = new Set(coupon.restricted_bundle_ids);
          if (item.itemType === "bundle" && !restricted.has(item.itemId)) {
            isEligible = false;
          }
        }

        if (isEligible) {
          eligibleSubtotal += item.couponBase;
          eligibleItems.push(item);
        }
      }

      if (eligibleSubtotal === 0) {
        throw CommerceErrors.COUPON_NOT_APPLICABLE(codeUpper);
      }

      totalDiscount = computeCouponDiscount({
        discountType: coupon.discount_type,
        discountValue: coupon.discount_value,
        maxDiscountAmount: coupon.max_discount_amount,
        eligibleCatalogSubtotal: eligibleSubtotal,
      });

      // Allocate proportional discount among eligible items by catalog base.
      // Tip remains on unitPrice, so finalAmount = catalog + tip - catalogDiscount.
      let remainingDiscountToDistribute = totalDiscount;
      for (let i = 0; i < eligibleItems.length; i++) {
        const it = eligibleItems[i]!;
        if (i === eligibleItems.length - 1) {
          it.discountAmount = remainingDiscountToDistribute;
        } else {
          const itemDiscount = Math.floor(
            (it.couponBase / eligibleSubtotal) * totalDiscount,
          );
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
        message: `${coupon.discount_type === "percentage" ? `${coupon.discount_value}%` : `₹${coupon.discount_value}`} discount applied.`,
      };
    }

    const totalTax = 0; // Configurable tax if needed in future
    const totalAmount = Math.max(
      0,
      subtotalAmount - totalDiscount + totalTax,
    );

    const pricing: PricingCalculation = {
      subtotalAmount,
      discountAmount: totalDiscount,
      taxAmount: totalTax,
      totalAmount,
      currency: detectedCurrency,
      couponCode: couponValidation?.code,
      couponId,
      items: calculatedItems.map((it) => ({
        itemType: it.itemType,
        itemId: it.itemId,
        title: it.title,
        unitPrice: it.unitPrice,
        discountAmount: it.discountAmount,
        taxAmount: it.taxAmount,
        finalAmount: it.finalAmount,
      })),
    };

    return {
      pricing,
      couponValidation,
    };
  }

  return {
    calculatePricing,
    calculateQuizPricing,
  };
}
