import type {
  CartItemInput,
  PricingAmountUnit,
  PricingCalculation,
  PricingRegion,
  CouponValidationResult,
} from "@veolms/contracts";
import { formatMoney } from "../shared/currency.ts";
import type { Executor } from "../shared/repository.types.ts";
import { CommerceErrors } from "../shared/commerce.errors.ts";
import { isRestrictedFreeCourse } from "../../access/index.ts";
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
import {
  courseSaleState,
  resolveCoursePricing,
  resolveInternationalCharge,
} from "./purchasable.ts";
import {
  listCoursesOpenedBy,
  listPartialHoldings,
  type PartialHolding,
} from "./upgrade-credit.ts";

export interface CalculatePricingParams {
  userId?: string | null;
  items: CartItemInput[];
  couponCode?: string | null;
  /**
   * Where the buyer is (`pricingRegionForCountry`). In the international
   * region a course that has a price for buyers outside India is charged
   * that price, in cents. Rupees when absent.
   */
  pricingRegion?: PricingRegion;
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
    // An unpublished course, or a quiz on a lesson that is not released yet,
    // is only visible to the course creator and admins.
    const isPrivileged =
      Boolean(params.isAdmin) ||
      (Boolean(params.userId) && offering.course_creator_id === params.userId);
    if (
      (offering.course_status !== "published" ||
        !offering.lesson_is_published) &&
      !isPrivileged
    ) {
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
   * validates coupon restrictions and applies discounts in whole major currency units, or in cents
   * for a course charged its price for buyers outside India (`amountUnit`).
   */
  async function calculatePricing(params: CalculatePricingParams) {
    const now = params.now ?? new Date();
    const { userId, items, couponCode, pricingRegion = "domestic" } = params;

    if (!items || items.length === 0) {
      throw CommerceErrors.EMPTY_CHECKOUT_ITEMS();
    }

    // Every entry becomes an order line of its own, so a course or bundle
    // named twice was charged twice for one enrolment. (Quiz passes have the
    // same check below, with their own message.)
    const seenItems = new Set<string>();
    for (const it of items) {
      if (it.itemType === "quiz") continue;
      const key = `${it.itemType}:${it.courseId ?? it.bundleId ?? ""}`;
      if (seenItems.has(key)) {
        throw CommerceErrors.PRICE_CALCULATION_FAILED(
          "The same item appears more than once in this request.",
        );
      }
      seenItems.add(key);
    }

    // 1. Fetch user enrollments if authenticated to prevent duplicate
    // ownership, and the courses they hold only part of, whose whole is an
    // upgrade with what they paid for the parts taken off.
    const [enrolledCourseIds, partialHoldings] = userId
      ? await Promise.all([
          enrollmentRepo
            .listUserEnrolledCourseIds(database, userId)
            .then((ids) => new Set(ids)),
          listPartialHoldings(database, userId),
        ])
      : [new Set<string>(), new Map<string, PartialHolding>()];
    let upgradeCredit: { amount: number; from: string[] } | undefined;

    const calculatedItems: Array<{
      itemType: "course" | "bundle" | "quiz";
      itemId: string;
      title: string;
      unitPrice: number;
      /** Catalog amount coupons may discount. Excludes voluntary tips. */
      couponBase: number;
      /**
       * `couponBase` in whole rupees. Coupon amounts (a fixed discount, a
       * cap, a minimum order) are set in rupees, and an item priced in
       * cents is measured against them through it. Otherwise the same as
       * `couponBase`.
       */
      domesticCouponBase: number;
      discountAmount: number;
      taxAmount: number;
      finalAmount: number;
    }> = [];
    let amountUnit: PricingAmountUnit = "major";

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

    const [
      courseRows,
      pricingRows,
      accessTypeRows,
      bundleRows,
      bundleCourseRows,
      quizRows,
    ] = await Promise.all([
      courseRepo.findCoursesByIds(database, courseIds),
      courseConfigRepo.findPricingByCourseIds(database, courseIds),
      courseConfigRepo.findAccessTypesByCourseIds(database, courseIds),
      bundleRepo.findBundlesByIds(database, bundleIds),
      bundleRepo.listBundleCoursesForBundleIds(database, bundleIds),
      quizPricingRepo.listOfferingsByPricingIds(database, quizPricingIds),
    ]);

    const coursesById = new Map(courseRows.map((c) => [c.id, c]));
    const pricingByCourseId = new Map(pricingRows.map((p) => [p.course_id, p]));
    const accessTypeByCourseId = new Map(
      accessTypeRows.map((rule) => [rule.course_id, rule.access_type]),
    );
    const bundlesById = new Map(bundleRows.map((b) => [b.id, b]));
    const bundleCoursesByBundleId = new Map<string, typeof bundleCourseRows>();
    for (const bc of bundleCourseRows) {
      const list = bundleCoursesByBundleId.get(bc.bundle_id) ?? [];
      list.push(bc);
      bundleCoursesByBundleId.set(bc.bundle_id, list);
    }
    const quizzesByPricingId = new Map(quizRows.map((q) => [q.pricing_id, q]));

    // One currency for the whole order. Outside India it is the price for
    // buyers there when every paid item has one; an order with anything
    // sold in rupees only (a bundle, a quiz pass, a course without that
    // price, a voluntary amount) is charged in rupees throughout, as before.
    const chargeInternationally =
      pricingRegion === "international" &&
      items.every((it) => {
        if (it.itemType !== "course") return false;
        const pricing = pricingByCourseId.get(it.courseId!);
        if (resolveCoursePricing(pricing).pricingType !== "paid") return true;
        return (
          (it.customAmount === undefined || it.customAmount === null) &&
          resolveInternationalCharge(pricing) !== null
        );
      });

    for (const item of items) {
      if (item.itemType === "course") {
        const courseId = item.courseId!;
        const course = coursesById.get(courseId);
        // An unpublished course answers exactly like a missing one: this runs
        // for anonymous callers too, and naming the course would disclose a
        // draft's title to anyone holding its id.
        //
        // An archived course was on sale once and is known to those who
        // saw it, so it says what it is: no longer sold. Those who have it
        // keep it; nobody can buy it.
        const saleState = courseSaleState(course?.status);
        if (saleState === "archived") {
          throw CommerceErrors.COURSE_NOT_AVAILABLE();
        }
        if (!course || saleState !== "on_sale") {
          throw CommerceErrors.COURSE_NOT_FOUND(courseId);
        }
        if (enrolledCourseIds.has(courseId)) {
          throw CommerceErrors.COURSE_ALREADY_OWNED(course.title);
        }
        // Part of a course (an unlisted course, sold from its link) is no
        // use to someone who has the whole course already.
        if (course.unlisted && userId) {
          const opened = await listCoursesOpenedBy(database, courseId);
          if (
            opened.length > 0 &&
            opened.every((whole) => enrolledCourseIds.has(whole.id))
          ) {
            throw CommerceErrors.COURSE_ALREADY_OWNED(opened[0]!.title);
          }
        }

        const pricing = pricingByCourseId.get(courseId);
        // A restricted course with no price is entered by a grant from
        // staff and by nothing else. Priced here it would become a
        // zero-amount order, the order a grant, and the restriction would
        // be something any signed-in learner could lift for themselves. A
        // voluntary amount does not change that: a tip buys no way in.
        // Asked after the ownership check, so a learner who was given
        // access is told they are enrolled, as for any other course.
        //
        // A course that sells for nothing is a free course here, whatever
        // was stored as its pricing type (resolveCoursePricing): a sale
        // price of zero must not turn a restricted course into one anyone
        // can enrol in.
        const { pricingType, catalogPrice } = resolveCoursePricing(pricing);
        if (
          isRestrictedFreeCourse({
            pricing_type: pricingType,
            access_type: accessTypeByCourseId.get(courseId),
          })
        ) {
          throw CommerceErrors.COURSE_ACCESS_RESTRICTED(course.title);
        }
        const isPaidCourse = pricingType === "paid";
        // Outside India, a course that has a price for buyers there is sold
        // at it, in cents, when the whole order can be (see
        // `chargeInternationally`).
        const international =
          chargeInternationally && isPaidCourse
            ? resolveInternationalCharge(pricing)
            : null;
        const domesticCurrency = pricing?.currency ?? "INR";
        const itemCurrency = international?.currency ?? domesticCurrency;
        const itemUnit: PricingAmountUnit = international ? "minor" : "major";
        const { unitPrice, couponBase } = international
          ? {
              unitPrice: international.salePriceMinor,
              couponBase: international.salePriceMinor,
            }
          : resolveCourseCharge({
              isPaidCourse,
              catalogPrice,
              customAmount: item.customAmount,
              currency: itemCurrency,
            });

        if (!currencyInitialized) {
          detectedCurrency = itemCurrency;
          amountUnit = itemUnit;
          currencyInitialized = true;
        } else if (
          (itemCurrency !== detectedCurrency || itemUnit !== amountUnit) &&
          unitPrice > 0
        ) {
          throw CommerceErrors.PRICE_CALCULATION_FAILED(
            `Cart contains items with mixed currencies (${detectedCurrency} and ${itemCurrency}).`,
          );
        }

        // An upgrade from part of the course: what was paid for the part
        // comes off, never below nothing, and no coupon is taken on top.
        // Paid in rupees and bought now in cents, it is taken at the
        // course's own rate (its price in cents against its rupee price).
        const holding = partialHoldings.get(courseId);
        if (holding && isPaidCourse) {
          let held = 0;
          if (holding.currency === itemCurrency) {
            held = international ? holding.creditMinor : holding.credit;
          } else if (
            international &&
            holding.currency === domesticCurrency &&
            catalogPrice > 0
          ) {
            held = Math.floor(
              (holding.credit * international.salePriceMinor) / catalogPrice,
            );
          }
          const credit = Math.min(unitPrice, held);
          calculatedItems.push({
            itemType: "course",
            itemId: courseId,
            title: `${course.title} (upgrade from ${holding.fromTitles.join(", ")})`,
            unitPrice,
            couponBase: 0,
            domesticCouponBase: 0,
            discountAmount: credit,
            taxAmount: 0,
            finalAmount: unitPrice - credit,
          });
          subtotalAmount += unitPrice;
          itemCourseMap.set(courseId, [courseId]);
          upgradeCredit = {
            amount: (upgradeCredit?.amount ?? 0) + credit,
            from: [...(upgradeCredit?.from ?? []), ...holding.fromTitles],
          };
          continue;
        }

        calculatedItems.push({
          itemType: "course",
          itemId: courseId,
          title: course.title,
          unitPrice,
          couponBase,
          domesticCouponBase: international ? catalogPrice : couponBase,
          discountAmount: 0,
          taxAmount: 0,
          finalAmount: unitPrice,
        });
        subtotalAmount += unitPrice;
        itemCourseMap.set(courseId, [courseId]);
      } else if (item.itemType === "bundle") {
        const bundleId = item.bundleId!;
        const bundle = bundlesById.get(bundleId);
        if (!bundle || bundle.status !== "published") {
          throw CommerceErrors.BUNDLE_NOT_FOUND(bundleId);
        }

        const bundleCourses = bundleCoursesByBundleId.get(bundleId) ?? [];
        const bundleCourseIds = bundleCourses.map((c) => c.course_id);

        // A bundle is sold whole. With a course in it that is no longer
        // sold, buying the bundle would be buying that course.
        if (
          bundleCourses.some(
            (c) => courseSaleState(c.course_status) === "archived",
          )
        ) {
          throw CommerceErrors.BUNDLE_COURSE_NOT_AVAILABLE(bundle.title);
        }

        // Check if student already owns ALL courses in bundle
        const allOwned =
          bundleCourseIds.length > 0 &&
          bundleCourseIds.every((cid) => enrolledCourseIds.has(cid));

        if (allOwned) {
          throw CommerceErrors.BUNDLE_ALL_COURSES_OWNED(bundle.title);
        }

        // A bundle is one price for all its courses, so buying it with one
        // of them already owned paid for that course a second time.
        const ownedCourses = bundleCourses.filter((c) =>
          enrolledCourseIds.has(c.course_id),
        );
        if (ownedCourses.length > 0) {
          throw CommerceErrors.BUNDLE_CONTAINS_OWNED_COURSE(
            bundle.title,
            ownedCourses.map((c) => c.course_title),
          );
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
          domesticCouponBase: unitPrice,
          discountAmount: 0,
          taxAmount: 0,
          finalAmount: unitPrice,
        });
        subtotalAmount += unitPrice;
        itemCourseMap.set(bundleId, bundleCourseIds);
      } else if (item.itemType === "quiz") {
        const quizPricingId = item.quizPricingId!;
        const offering = quizzesByPricingId.get(quizPricingId);
        if (!offering || offering.course_status !== "published") {
          throw CommerceErrors.QUIZ_NOT_FOUND(quizPricingId);
        }
        const passTitle = `Quiz pass: ${offering.course_title}`;
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
          domesticCouponBase: 0,
          discountAmount: 0,
          taxAmount: 0,
          finalAmount: charge.effectivePrice,
        });
        subtotalAmount += charge.effectivePrice;
        itemCourseMap.set(quizPricingId, [offering.course_id]);
      }
    }

    // A course bought on its own next to a bundle that already contains it
    // would be paid for twice. Checked once every item is known to be on
    // sale, so the answer says nothing about an unpublished course.
    //
    // The same holds between bundles: two bundles that share a course were
    // each charged in full for the one enrolment in that course.
    const requestedCourseIds = new Set(courseIds);
    const bundledCourseIds = new Set<string>();
    for (const bundleId of bundleIds) {
      const included = itemCourseMap.get(bundleId) ?? [];
      if (included.some((courseId) => requestedCourseIds.has(courseId))) {
        throw CommerceErrors.PRICE_CALCULATION_FAILED(
          "A course in this request is already part of a bundle in the same request.",
        );
      }
      if (included.some((courseId) => bundledCourseIds.has(courseId))) {
        throw CommerceErrors.PRICE_CALCULATION_FAILED(
          "Two bundles in this request contain the same course.",
        );
      }
      for (const courseId of included) bundledCourseIds.add(courseId);
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
      // The minimum order is set in rupees, so it is measured in rupees.
      const catalogSubtotal = calculatedItems.reduce(
        (sum, it) => sum + it.domesticCouponBase,
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
      let eligibleDomesticSubtotal = 0;
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
        const hasBundleRestriction = Boolean(
          coupon.restricted_bundle_ids &&
          coupon.restricted_bundle_ids.length > 0,
        );
        const hasCourseRestriction = Boolean(
          coupon.restricted_course_ids &&
          coupon.restricted_course_ids.length > 0,
        );
        // The mirror of the rule below: a coupon limited to specific bundles
        // is for those bundles only, and used to discount every course too.
        if (
          hasBundleRestriction &&
          !hasCourseRestriction &&
          item.itemType === "course"
        ) {
          isEligible = false;
        }
        if (
          coupon.restricted_course_ids &&
          coupon.restricted_course_ids.length > 0
        ) {
          const restricted = new Set(coupon.restricted_course_ids);
          if (item.itemType === "course" && !restricted.has(item.itemId)) {
            isEligible = false;
          }
          // A coupon limited to specific courses is for those courses only.
          // Without this, it still discounted every bundle — so a coupon an
          // instructor scoped to their own course could be spent on any
          // bundle in the academy.
          if (item.itemType === "bundle" && !hasBundleRestriction) {
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
          eligibleDomesticSubtotal += item.domesticCouponBase;
          eligibleItems.push(item);
        }
      }

      if (eligibleSubtotal === 0) {
        throw CommerceErrors.COUPON_NOT_APPLICABLE(codeUpper);
      }

      // A coupon's amounts are set in rupees. Against items priced in cents
      // they are taken at those items' own rate (what they sell for in
      // cents against their rupee price), rounded down to a cent. A
      // percentage needs no converting.
      const toChargeUnits = (rupees: number) =>
        amountUnit === "minor" && eligibleDomesticSubtotal > 0
          ? Math.floor((rupees * eligibleSubtotal) / eligibleDomesticSubtotal)
          : rupees;
      totalDiscount = computeCouponDiscount({
        discountType: coupon.discount_type,
        discountValue:
          coupon.discount_type === "fixed"
            ? toChargeUnits(coupon.discount_value)
            : coupon.discount_value,
        maxDiscountAmount: coupon.max_discount_amount
          ? toChargeUnits(coupon.max_discount_amount)
          : coupon.max_discount_amount,
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
        message: `${
          coupon.discount_type === "percentage"
            ? `${coupon.discount_value}%`
            : amountUnit === "minor"
              ? formatMoney(totalDiscount, {
                  currency: detectedCurrency,
                  unit: "minor",
                })
              : `₹${coupon.discount_value}`
        } discount applied.`,
      };
    }

    // An upgrade's credit comes off with any coupon on the other items.
    totalDiscount += upgradeCredit?.amount ?? 0;
    const totalTax = 0; // Configurable tax if needed in future
    const totalAmount = Math.max(0, subtotalAmount - totalDiscount + totalTax);

    const pricing: PricingCalculation = {
      amountUnit,
      subtotalAmount,
      discountAmount: totalDiscount,
      ...(upgradeCredit ? { upgradeCredit } : {}),
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
