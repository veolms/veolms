import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { MouseEvent } from "react";
import { useLocation, useParams } from "react-router";
import { BookOpen } from "@phosphor-icons/react/BookOpen";
import { CaretDown } from "@phosphor-icons/react/CaretDown";
import { PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { Heart } from "@phosphor-icons/react/Heart";
import { Play } from "@phosphor-icons/react/Play";
import { ShoppingBag } from "@phosphor-icons/react/ShoppingBag";
import {
  MAX_VOLUNTARY_AMOUNT,
  type Category,
  type CheckoutPreviewResponse,
  type CourseAccessEnrollment,
  type CourseAccessResume,
  type CourseEditorDataResponse,
  type CourseOverviewResponse,
  type PartialAccessOffer,
} from "@veolms/contracts";
import {
  getCourseRouteKey,
  type Course,
  type CourseLevel,
  type CourseCategory,
  type CourseLifecycleStatus,
  type CourseRole,
} from "./catalogue";
import {
  checkoutCourseItem,
  describeCouponSaving,
  isCouponTotalStale,
  payableBeforeCoupon,
  type AppliedCoupon,
} from "./couponTotal";
import {
  INVITATION_ONLY_MESSAGE,
  resolveCourseEnrollmentOffer,
} from "./courseEnrollmentOffer";
import { readCustomAmount } from "./customAmountEntry";
import { readPastedCouponCode } from "./pastedCouponCode";
import { formatPlainDescription } from "./overview/formatPlainDescription";
import { useCourseWishlisted, useToggleWishlistCourse } from "../wishlist";
import type { CourseSection } from "../learning/courseContent";
import { getCoursePlayerPath } from "../learning/coursePlayerNavigation";
import { useLearningProgressResumeContext } from "../services/learning-progress";
import {
  useLessonListOpenIntent,
  useLessonOpenIntent,
} from "../learning/lessonOpenIntent";
import type { LessonIntentFor } from "./overview/CourseOverviewCurriculum";
import type { NavigateTo } from "../routing/navigation";
import { productName } from "../routing/routeDescriptors";
import { authStore, useAuthStore } from "../store/auth.store";
import { LOGIN_DIALOG_PARAM } from "../routing/routeAccess";
import {
  forgetPendingPurchase,
  rememberPendingPurchase,
  takePendingPurchase,
} from "./overview/pendingPurchase";
import { useCoursePageData } from "./overview/useCoursePageData";
import { CurriculumIntentContext } from "./overview/curriculumIntent";
import type { CourseCurriculumPreview } from "./staticCurriculum";
import { getApiError } from "../lib/api-error";
import { trackAnalyticsEvent } from "../lib/analytics-track";
import {
  readCheckoutStartError,
  openGatewayCheckout,
  type StopGatewayCheckout,
  useCheckoutPreview,
  useAwaitPaidOrder,
  useCreateCheckoutOrder,
  useReleaseCheckoutOrder,
  useVerifyPayment,
} from "../services/payments";
import { useCurrentUser } from "../services/auth";
import { DiscussionMarkdown } from "../learning/discussion-editor/DiscussionMarkdown";
import { createDiscussionDraft } from "../learning/discussion-editor/types";
import {
  formatCourseDuration,
  formatDuration,
  resolveCourseDurationSeconds,
} from "./courseAdapter";
import { IncludedCoursesList } from "./overview/IncludedCoursesList";
import { FreeWithCourseNote } from "./FreeWithCourseNote";
import { CourseLearnerProgressBar } from "./overview/CourseLearnerProgressBar";
import { CourseLearnerProgressBarEarly } from "./overview/CourseLearnerProgressBarEarly";
import { CourseOverviewCurriculum } from "./overview/CourseOverviewCurriculum";
import { courseValidityLabel } from "./overview/courseValidity";
import {
  CourseOverviewHero,
  overviewColumnClasses,
} from "./overview/CourseOverviewHero";
import { CourseOverviewSkeleton } from "./overview/CourseOverviewSkeleton";
import { CourseLoadError } from "./overview/CourseLoadError";
import { CourseManagerBar } from "./overview/CourseManagerBar";
import { CourseViewerBandPlaceholder } from "./overview/CourseViewerBandPlaceholder";
import { PartialAccessNotice } from "./overview/PartialAccessNotice";
import { usePartialAccessOffer } from "../services/courses/courses.queries";
import {
  coursePurchaseCheckoutNote,
  coursePurchaseGuarantee,
  getCoursePurchasePerks,
  type CourseIncludeLine,
} from "./overview/coursePurchasePerks";
import {
  presumedGuestOnlyClasses,
  sessionExpectedOnlyClasses,
  type CourseViewerState,
} from "./overview/courseViewerState";
import { HoverFillIcon } from "./overview/HoverFillIcon";
import { PayCardIcon } from "./overview/PayCardIcon";
import {
  CoursePriceBar,
  type CoursePriceDisplayPrice,
} from "./overview/CoursePriceBar";
import {
  bandHeaderClasses,
  bandLinkClasses,
  bandTitleClasses,
  overviewCardClasses,
  overviewCardPaddingClasses,
  overviewBandColumnClasses,
  overviewColumnUnderHeroClasses,
  overviewPageContainerClasses,
  overviewTwoColumnClasses,
} from "./overview/overviewStyles";
import {
  CourseSupportAmountPicker,
  type ContributionPresetId,
} from "./overview/CourseSupportAmountPicker";
import { formatPriceWithCurrency } from "./overview/coursePriceFormat";
import { getCourseEditorPath } from "./courseEditorRouting";

// Asked for only when an enrolment needs a verified number first, so its
// code is fetched then and not with the page.
const PhoneVerificationDialog = lazy(
  () => import("../auth/PhoneVerificationDialog"),
);

export { CourseOverviewSkeleton };

// ─── Helpers for Currency, Sale Window, Language, and Price Sizing ────────────

export type PriceSizeVariant = "normal" | "medium" | "large" | "xlarge";

export function getPriceSizeVariant(priceStr: string): PriceSizeVariant {
  if (!priceStr || priceStr.toLowerCase() === "free") return "normal";
  const digitsOnly = priceStr.replace(/\D/g, "");
  const digitCount = digitsOnly.length;
  if (digitCount >= 8) return "xlarge";
  if (digitCount >= 6) return "large";
  if (digitCount === 5) return "medium";
  return "normal";
}

export const priceTextClasses: Record<PriceSizeVariant, string> = {
  normal: "text-[2.15rem] max-[640px]:text-[1.95rem] tracking-[-0.03em]",
  medium: "text-[1.95rem] max-[640px]:text-[1.75rem] tracking-[-0.025em]",
  large: "text-[1.75rem] max-[640px]:text-[1.55rem] tracking-[-0.02em]",
  xlarge: "text-[1.55rem] max-[640px]:text-[1.4rem] tracking-[-0.015em]",
};

export function isCourseSaleActive(
  salePrice: number | null | undefined,
  regularPrice: number,
  saleStartsAt?: string | null,
  saleEndsAt?: string | null,
): boolean {
  if (salePrice == null || salePrice <= 0 || salePrice >= regularPrice) {
    return false;
  }
  const now = new Date().getTime();
  if (saleStartsAt) {
    const starts = new Date(saleStartsAt).getTime();
    if (!isNaN(starts) && starts > now) {
      return false;
    }
  }
  if (saleEndsAt) {
    const ends = new Date(saleEndsAt).getTime();
    if (!isNaN(ends) && ends < now) {
      return false;
    }
  }
  return true;
}

export function getLanguageLabel(code?: string | null): string | undefined {
  if (!code || !code.trim()) return undefined;
  const trimmed = code.trim();
  const map: Record<string, string> = {
    en: "English",
    es: "Spanish",
    fr: "French",
    de: "German",
    hi: "Hindi",
    zh: "Chinese",
    ja: "Japanese",
    ar: "Arabic",
    pt: "Portuguese",
    ru: "Russian",
    it: "Italian",
  };
  return (
    map[trimmed.toLowerCase()] ||
    (trimmed.length <= 3
      ? trimmed.toUpperCase()
      : trimmed.charAt(0).toUpperCase() + trimmed.slice(1))
  );
}

export interface CourseInclude {
  icon: typeof BookOpen;
  label: string;
}

export interface CourseOverviewPricingProps {
  price?: string;
  originalPrice?: string;
  discount?: string;
  /** Catalog charge in major currency units. */
  amount?: number;
  /** The marked price in major units, when `originalPrice` is shown. */
  originalAmount?: number;
  currency?: string;
  /** What the price box calls the discount, when it is not a sale. */
  discountName?: string;
}

export function isFreeCoursePricing(
  pricing?: CourseOverviewPricingProps | null,
): boolean {
  if (!pricing) return true;
  if (typeof pricing.amount === "number") return pricing.amount <= 0;
  if (!pricing.price) return true;
  const p = pricing.price.trim().toLowerCase();
  if (p === "free" || p === "0") return true;
  return /^(?:[$₹€£]\s*0+(?:\.0+)?|0+(?:\.0+)?)$/.test(p);
}

function toOverviewPricingProps(
  pr?: {
    pricingType: "free" | "paid";
    price: number;
    currency?: string;
    salePrice?: number | null;
  } | null,
): CourseOverviewPricingProps {
  const currency = pr?.currency || "INR";
  if (!pr || pr.pricingType === "free") {
    // A free course that names what it would otherwise cost shows that
    // price struck through beside a price of zero.
    if (pr && pr.price > 0) {
      return {
        price: formatPriceWithCurrency(0, currency),
        originalPrice: formatPriceWithCurrency(pr.price, currency),
        discount: "Free",
        amount: 0,
        currency,
      };
    }
    return { price: "Free", amount: 0, currency };
  }

  const activeSale = isCourseSaleActive(pr.salePrice, pr.price);
  if (activeSale && pr.salePrice != null) {
    const discountPct = Math.round(
      ((pr.price - pr.salePrice) / pr.price) * 100,
    );
    return {
      price: formatPriceWithCurrency(pr.salePrice, currency),
      originalPrice: formatPriceWithCurrency(pr.price, currency),
      discount: `${discountPct}% OFF`,
      amount: pr.salePrice,
      originalAmount: pr.price,
      currency,
    };
  }

  return {
    price: formatPriceWithCurrency(pr.price, currency),
    amount: pr.price,
    currency,
  };
}

function appliedCouponFromPreview(
  code: string,
  res: CheckoutPreviewResponse,
  pricedForAmount: number,
): AppliedCoupon {
  const discountAmount = res.pricing.discountAmount;
  const currency = res.pricing.currency || "INR";
  const totalAmount = res.pricing.totalAmount;
  let discountLabel: string | undefined;
  if (res.couponValidation?.discountValue) {
    discountLabel =
      res.couponValidation.discountType === "percentage"
        ? `${res.couponValidation.discountValue}% OFF`
        : `${formatPriceWithCurrency(res.couponValidation.discountValue, currency)} OFF`;
  } else if (discountAmount > 0) {
    discountLabel = `${formatPriceWithCurrency(discountAmount, currency)} OFF`;
  }
  return {
    code,
    discountAmount,
    totalAmount,
    currency,
    discountLabel,
    pricedForAmount,
  };
}

// ─── Price, Coupon & Enrolment ──────────────────────────────────────────────

/**
 * Whether a buyer is offered amounts above the price ("Support Teacher").
 * Switched off for now: the page shows the course's one price. The checkout
 * below still handles a chosen amount, so turning this on brings the picker
 * back as it was.
 */
const SUPPORT_AMOUNTS_OFFERED: boolean = false;

interface CoursePurchaseSectionProps {
  course: Course;
  pricing?: CourseOverviewPricingProps;
  inclusions?: readonly CourseIncludeLine[];
  onNavigatePage?: NavigateTo;
  isReadOnlyPreview?: boolean;
  isCreator?: boolean;
  /** The overview's `canSelfEnroll`; only `false` closes enrolment. */
  canSelfEnroll?: boolean;
  /**
   * The overview's `includedWith`: for a linked-only course, the courses
   * it comes free with. The card sends a visitor to the first of them.
   */
  includedWith?: CourseOverviewResponse["includedWith"];
  /** The overview's `includedCourses`: the courses that come free with it. */
  includedCourses?: CourseOverviewResponse["includedCourses"];
  /**
   * Whether the page knows who is looking (see `courseViewerState`): a
   * purchase started before signing in waits for it.
   */
  viewerKnown?: boolean;
  /**
   * What is bought, when it is not the course itself: the part of it a
   * partial access link sells (an unlisted course). `pricing` is its price.
   */
  purchaseCourseId?: string;
  /** What the payment window names, with `purchaseCourseId`. */
  purchaseTitle?: string;
}

function CoursePurchaseSection({
  course,
  pricing,
  inclusions,
  onNavigatePage,
  isReadOnlyPreview = false,
  isCreator = false,
  canSelfEnroll,
  includedWith,
  includedCourses,
  viewerKnown = true,
  purchaseCourseId,
  purchaseTitle,
}: CoursePurchaseSectionProps) {
  const user = useAuthStore((state) => state.user);
  // What checkout sells: the course, or the part of it this page offers.
  const buyCourseId = purchaseCourseId ?? course.id;
  const preview = useCheckoutPreview();
  const createOrder = useCreateCheckoutOrder();
  // The course page being opened, for the conversion funnel.
  useEffect(() => {
    trackAnalyticsEvent("course_view", { courseId: course.id });
  }, [course.id]);
  const checkoutIntentRef = useRef<{ intent: string; key: string } | null>(
    null,
  );
  const releaseOrder = useReleaseCheckoutOrder();
  const verify = useVerifyPayment();
  const awaitPaidOrder = useAwaitPaidOrder();
  const paymentConfirmationRef = useRef<AbortController | null>(null);
  useEffect(() => () => paymentConfirmationRef.current?.abort(), []);
  // The watch kept on the gateway's window while it is open (see
  // `openGatewayCheckout`).
  const stopGatewayCheckoutRef = useRef<StopGatewayCheckout | null>(null);
  useEffect(() => () => stopGatewayCheckoutRef.current?.(), []);
  const isEnrolled = Boolean(user && course.enrolled);

  const [isPaymentBusy, setIsPaymentBusy] = useState(false);
  // A verified mobile number before the first enrolment, where the academy
  // asks for one (REQUIRE_VERIFIED_PHONE_FOR_ENROLLMENT) of a new account:
  // the server says so when the order is asked for (only new accounts are
  // asked), and the enrolment waits behind the number's pop-up and carries
  // on once it is verified.
  const currentUser = useCurrentUser();
  const [phoneGate, setPhoneGate] = useState<{
    amount: number | undefined;
    couponCode: string | undefined;
  } | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentNotice, setPaymentNotice] = useState<string | null>(null);

  const [selectedPreset, setSelectedPreset] =
    useState<ContributionPresetId>("0");
  const [voluntaryAmount, setVoluntaryAmount] = useState<number>(0);
  const [customAmountInput, setCustomAmountInput] = useState<string>("");
  const [customAmountError, setCustomAmountError] = useState<string | null>(
    null,
  );

  const [couponInputOpen, setCouponInputOpen] = useState(false);
  const [couponCodeInput, setCouponCodeInput] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(
    null,
  );

  const courseCurrency = pricing?.currency ?? "INR";
  const baseNumericPrice = pricing?.amount ?? 0;
  const isPreview = Boolean(isReadOnlyPreview);
  const isCreatorNormal = Boolean(isCreator && !isPreview);
  const isFree = isFreeCoursePricing(pricing);
  // A restricted course with no price is entered by a grant from staff and
  // checkout refuses it, so the card offers no enrolment, amount or coupon
  // for it: one line says how the course is entered.
  const isInvitationOnly =
    resolveCourseEnrollmentOffer({
      managesCourse: isCreatorNormal,
      isPreview,
      isEnrolled,
      isFree,
      canSelfEnroll,
    }) === "invitation-only";
  // A linked-only course is not enrolled in on its own: it is had by
  // buying the course it comes with. The card shows it as free with that
  // course, and its button opens that course's page, where it is bought
  // (with a coupon, if there is one).
  const includingCourse = isInvitationOnly ? includedWith?.[0] : undefined;

  const checkoutItem = useMemo(
    () =>
      checkoutCourseItem(buyCourseId, {
        isFree,
        amount: voluntaryAmount,
        catalogPrice: baseNumericPrice,
      }),
    [buyCourseId, isFree, voluntaryAmount, baseNumericPrice],
  );

  // What a payment would charge before the coupon, and whether the coupon
  // total on the card was worked out for it. Both are read during render, so
  // the pay button is already held on the render that follows a change of
  // amount; it does not wait for the effect below.
  const payableAmount = payableBeforeCoupon(voluntaryAmount, baseNumericPrice);
  const couponTotalIsStale =
    !isFree && isCouponTotalStale(appliedCoupon, payableAmount);
  const appliedCouponCode = appliedCoupon?.code;
  // `preview` is a new object on every render, and starting the request
  // causes a render. As a dependency it cancelled the effect's own request,
  // so the answer was dropped and the old total stayed. The function is the
  // same one for the life of the component.
  const previewCheckout = preview.mutateAsync;
  useEffect(() => {
    if (!appliedCouponCode || !couponTotalIsStale) return;

    let cancelled = false;
    const handle = window.setTimeout(async () => {
      try {
        const res = await previewCheckout({
          items: [checkoutItem],
          couponCode: appliedCouponCode,
        });
        if (cancelled) return;
        if (res.couponValidation && !res.couponValidation.valid) {
          setAppliedCoupon(null);
          setCouponError(
            res.couponValidation.message ||
              "Coupon is no longer valid for this amount.",
          );
          return;
        }
        setAppliedCoupon(
          appliedCouponFromPreview(appliedCouponCode, res, payableAmount),
        );
      } catch (err) {
        if (cancelled) return;
        // The total for this amount is unknown. The coupon comes off so the
        // button names a price that is known, and the reason is shown.
        setAppliedCoupon(null);
        setCouponError(
          `The coupon was removed because its total for this amount could not be worked out. ${getApiError(err).message}`,
        );
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [
    appliedCouponCode,
    checkoutItem,
    couponTotalIsStale,
    payableAmount,
    previewCheckout,
  ]);

  const basePrice = pricing?.price ?? "Free";
  const displayPrice = appliedCoupon
    ? appliedCoupon.totalAmount === 0
      ? "Free"
      : formatPriceWithCurrency(
          appliedCoupon.totalAmount,
          appliedCoupon.currency,
        )
    : voluntaryAmount > 0 && voluntaryAmount > baseNumericPrice
      ? formatPriceWithCurrency(voluntaryAmount, courseCurrency)
      : basePrice;
  // The headline is then the buyer's own, higher amount. The catalogue's
  // "was" price and "% OFF" badge describe the regular price, and next to a
  // chosen amount they claimed a discount that is not being given.
  const isPayingAbovePrice =
    !isFree &&
    !appliedCoupon &&
    voluntaryAmount > 0 &&
    voluntaryAmount > baseNumericPrice;
  const originalPrice = isPayingAbovePrice ? undefined : pricing?.originalPrice;
  const discount = isPayingAbovePrice ? undefined : pricing?.discount;
  // With a coupon, what the total is compared with. On the buyer's own,
  // higher amount the catalogue price and the coupon's "% OFF" are both the
  // wrong comparison (see `describeCouponSaving`).
  const couponSaving =
    !isFree && appliedCoupon
      ? describeCouponSaving(appliedCoupon, baseNumericPrice)
      : null;
  // A coupon used on a course that is already on sale: both savings are
  // shown, the sale's own and then the coupon's ("30% OFF + 20% OFF"), and
  // the price struck through stays the marked one. The two are not added
  // up: the coupon's share is of the sale price, and one figure for both
  // would be a third number that is written nowhere else.
  const couponOnTopOfSale =
    couponSaving?.against === "catalogue" && Boolean(originalPrice && discount);
  const couponSavingLabel = appliedCoupon
    ? appliedCoupon.discountLabel ||
      `${formatPriceWithCurrency(appliedCoupon.discountAmount, appliedCoupon.currency)} OFF`
    : undefined;
  const struckThroughPrice =
    !couponSaving || !appliedCoupon
      ? originalPrice
      : couponSaving.against === "catalogue"
        ? couponOnTopOfSale
          ? originalPrice
          : basePrice
        : couponSaving.against === "ownAmount"
          ? formatPriceWithCurrency(
              couponSaving.wasAmount,
              appliedCoupon.currency,
            )
          : undefined;
  const displayDiscount = !appliedCoupon
    ? discount
    : couponSaving?.against === "ownAmount"
      ? `${formatPriceWithCurrency(couponSaving.savedAmount, appliedCoupon.currency)} OFF`
      : couponSaving?.against === "nothing"
        ? undefined
        : couponOnTopOfSale
          ? discount
          : couponSavingLabel;
  // A paid course's price said in full: the marked price and the sale's
  // amount off, the coupon's amount off once one is in use, and the total.
  // Left out where the price line says something else: a free course, the
  // buyer's own higher amount, a coupon that takes nothing off.
  const priceBreakdown = (() => {
    if (isFree || isPayingAbovePrice || isCreatorNormal) return undefined;
    if (appliedCoupon && couponSaving?.against === "nothing") return undefined;
    const currency = appliedCoupon?.currency ?? courseCurrency;
    const before = appliedCoupon
      ? appliedCoupon.totalAmount + appliedCoupon.discountAmount
      : baseNumericPrice;
    const markedAmount =
      originalPrice &&
      discount &&
      pricing?.originalAmount &&
      (!appliedCoupon || couponOnTopOfSale)
        ? pricing.originalAmount
        : undefined;
    return {
      sale:
        markedAmount && originalPrice && discount
          ? {
              marked: originalPrice,
              discount: formatPriceWithCurrency(
                markedAmount - before,
                currency,
              ),
              label: discount.replace(/\s*off$/i, "").trim() + " off",
              name: pricing?.discountName,
            }
          : undefined,
      beforeCoupon: formatPriceWithCurrency(before, currency),
      coupon: appliedCoupon
        ? {
            code: appliedCoupon.code,
            discount: formatPriceWithCurrency(
              appliedCoupon.discountAmount,
              currency,
            ),
          }
        : undefined,
      total: displayPrice,
    };
  })();
  const perksList = getCoursePurchasePerks({
    duration: course.duration,
    lessons: course.lectures,
    sections: course.sections,
    courseIncludes: inclusions,
  });
  // The payment line and the money-back promise only where something is
  // paid for.
  const isPaidPurchase = !isFree && !isInvitationOnly && !isCreatorNormal;
  const priceSizeVariant = getPriceSizeVariant(displayPrice);

  const applyCouponCode = async (rawCode: string) => {
    const code = rawCode.trim().toUpperCase();
    if (!code) return;
    setCouponBusy(true);
    setCouponError(null);
    // A code tried while another is applied (it was pasted on the page)
    // does not take the applied one off unless it is good; a refusal says
    // that the applied one is still there.
    const stillApplied = appliedCoupon
      ? ` ${appliedCoupon.code} is still applied.`
      : "";

    try {
      const res = await preview.mutateAsync({
        items: [checkoutItem],
        couponCode: code,
      });

      if (res.couponValidation && !res.couponValidation.valid) {
        // Never the code itself: a private code is the creator's to share.
        trackAnalyticsEvent("coupon_rejected", { courseId: course.id });
        setCouponError(
          (res.couponValidation.message || "Invalid coupon code.") +
            stillApplied,
        );
        return;
      }

      // `payableAmount` is the amount this request was made for. If the
      // buyer changed theirs while it was in flight, the total is stale on
      // arrival and the effect above asks again.
      setAppliedCoupon(appliedCouponFromPreview(code, res, payableAmount));
      trackAnalyticsEvent("coupon_applied", { courseId: course.id });
      setCouponInputOpen(false);
      setCouponCodeInput("");
    } catch (err) {
      setCouponError(getApiError(err).message + stillApplied);
    } finally {
      setCouponBusy(false);
    }
  };

  const handleApplyCoupon = () => void applyCouponCode(couponCodeInput);

  // With a coupon applied there is no field for a refusal to hang from, so
  // it is a line under the bar; it has nothing to be corrected in, and
  // goes away by itself.
  useEffect(() => {
    if (!appliedCouponCode || !couponError) return undefined;
    const handle = window.setTimeout(() => setCouponError(null), 6000);
    return () => window.clearTimeout(handle);
  }, [appliedCouponCode, couponError]);

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponError(null);
    setCouponCodeInput("");
  };

  // The server has the money: unlike `payment_result: paid`, which the
  // gateway's window reports before the server has checked anything.
  const trackPaidEnrollment = (orderId: string) => {
    trackAnalyticsEvent("payment_confirmed", {
      courseId: course.id,
      orderId,
      props: { item: "course" },
    });
    trackAnalyticsEvent("enrollment_completed", {
      courseId: course.id,
      props: { kind: "paid", item: "course" },
    });
  };

  const confirmPaidOrder = async (orderId: string) => {
    paymentConfirmationRef.current?.abort();
    const confirmation = new AbortController();
    paymentConfirmationRef.current = confirmation;

    setPaymentError(null);
    setPaymentNotice(
      "Payment received. We are confirming your access — this can take a few minutes. Please do not pay again.",
    );
    setIsPaymentBusy(true);

    const paid = await awaitPaidOrder(orderId, confirmation.signal);
    if (confirmation.signal.aborted) return;
    paymentConfirmationRef.current = null;

    setPaymentNotice(null);
    setIsPaymentBusy(false);
    if (paid) {
      trackPaidEnrollment(orderId);
      onNavigatePage?.(
        `/learn/${encodeURIComponent(getCourseRouteKey(course))}`,
      );
      return;
    }
    setPaymentError(
      "Your payment was received, but confirming it is taking longer than usual. Your course will unlock automatically — check Purchase History in a few minutes. Please do not pay again.",
    );
  };

  /**
   * The gateway's window can go away without telling the page anything: it
   * calls neither the success handler nor `ondismiss` when the learner
   * closes it from one of its own error screens ("Uh! oh! Something went
   * wrong"). The button then stayed on "Processing…" for good. Worse, the
   * card may already have been charged by then, as it was when this was
   * found: the gateway had captured the payment and failed afterwards.
   *
   * So while the window is open it is watched (see openGatewayCheckout),
   * and if it closes unanswered the button is given back with a message
   * that tells the truth about what is not known, and the order goes on
   * being watched: the server's recovery cycle marks a captured payment paid
   * within a few minutes, and the course then opens without the learner
   * paying twice.
   */
  const followUpUnansweredClose = async (orderId: string) => {
    paymentConfirmationRef.current?.abort();
    const confirmation = new AbortController();
    paymentConfirmationRef.current = confirmation;

    setIsPaymentBusy(false);
    setPaymentNotice(null);
    setPaymentError(
      "The payment window closed before we heard back from it. If your payment went through, this course will unlock by itself within a few minutes, so please check Purchase History before paying again.",
    );

    const paid = await awaitPaidOrder(orderId, confirmation.signal);
    if (confirmation.signal.aborted) return;
    paymentConfirmationRef.current = null;
    if (paid) {
      trackPaidEnrollment(orderId);
      setPaymentError(null);
      onNavigatePage?.(
        `/learn/${encodeURIComponent(getCourseRouteKey(course))}`,
      );
    }
  };

  const handlePayNow = async (
    voluntaryContributionAmount?: number,
    {
      phoneChecked = false,
      couponCode: couponOverride,
      resumed = false,
    }: {
      phoneChecked?: boolean;
      /** The coupon to buy with, when it is not (yet) the applied one. */
      couponCode?: string;
      /** Carried on after signing in; the press was counted then. */
      resumed?: boolean;
    } = {},
  ) => {
    if (isReadOnlyPreview) return;
    if (!phoneChecked && !resumed) {
      trackAnalyticsEvent("enroll_click", {
        courseId: course.id,
        outcome: user ? "signed_in" : "guest",
      });
    }
    if (!user) {
      // Opens the login pop-up over this course page, and keeps the press:
      // once signed in, the page carries on with this purchase (see
      // pendingPurchase.ts).
      if (onNavigatePage) {
        rememberPendingPurchase({
          courseId: buyCourseId,
          ...(voluntaryContributionAmount !== undefined
            ? { amount: voluntaryContributionAmount }
            : {}),
          ...(!isFree && appliedCoupon
            ? { couponCode: appliedCoupon.code }
            : {}),
        });
        onNavigatePage("/login");
      } else setPaymentError("Please log in before enrolling.");
      return;
    }
    setIsPaymentBusy(true);
    setPaymentError(null);

    try {
      const item = checkoutCourseItem(buyCourseId, {
        isFree,
        amount: voluntaryContributionAmount ?? 0,
        catalogPrice: baseNumericPrice,
      });
      const coupon = (couponOverride ?? appliedCoupon?.code)?.trim();
      const couponCode = !isFree && coupon ? coupon.toUpperCase() : undefined;
      // The key identifies this purchase, not this click: a second click on
      // the same course, amount and coupon must reach the same order. A new
      // key per click made the server see every retry as a new purchase.
      const intent = JSON.stringify([item, couponCode ?? null]);
      if (checkoutIntentRef.current?.intent !== intent) {
        checkoutIntentRef.current = { intent, key: crypto.randomUUID() };
      }
      const order = await createOrder.mutateAsync({
        items: [item],
        ...(couponCode ? { couponCode } : {}),
        idempotencyKey: checkoutIntentRef.current.key,
      });
      trackAnalyticsEvent("checkout_start", {
        courseId: course.id,
        orderId: order.order.id,
        outcome: order.gateway ? "payment" : "free",
      });

      if (!order.gateway) {
        trackAnalyticsEvent("payment_result", {
          courseId: course.id,
          orderId: order.order.id,
          outcome: "free",
        });
        trackAnalyticsEvent("enrollment_completed", {
          courseId: course.id,
          props: { kind: "free", item: "course" },
        });
        setIsPaymentBusy(false);
        onNavigatePage?.(
          `/learn/${encodeURIComponent(getCourseRouteKey(course))}`,
        );
        return;
      }

      // The same purchase was already paid — an earlier attempt whose
      // confirmation did not reach this page. Opening the gateway again would
      // invite a second payment for an order that is complete.
      if (order.order.status === "paid") {
        await confirmPaidOrder(order.order.id);
        return;
      }

      // The order is cancelled on the server, so paying again (with another
      // coupon, at another amount) is not refused as a second payment while
      // the closed window's time runs out. The button waits for that
      // answer, so a quick second click does not race it. A payment the
      // gateway may still take keeps its order.
      const releaseThisOrder = () =>
        void releaseOrder
          .mutateAsync(order.order.id)
          .then((result) => {
            if (result.released) checkoutIntentRef.current = null;
          })
          .catch(() => undefined)
          .finally(() => setIsPaymentBusy(false));

      // The gateway the server chose for this buyer (by their country):
      // Razorpay in India, Dodo Payments elsewhere.
      stopGatewayCheckoutRef.current?.();
      stopGatewayCheckoutRef.current = await openGatewayCheckout(
        {
          gateway: order.gateway,
          name: productName,
          description:
            (voluntaryContributionAmount ?? 0) > baseNumericPrice ||
            (isFree && (voluntaryContributionAmount ?? 0) > 0)
              ? `Support Creator - ${course.title}`
              : (purchaseTitle ?? course.title),
          prefill: {
            name: user.displayName || user.username,
            email: user.email,
          },
        },
        {
          onPaid: async (proof) => {
            trackAnalyticsEvent("payment_result", {
              courseId: course.id,
              orderId: order.order.id,
              outcome: "paid",
            });
            try {
              await verify.mutateAsync({ orderId: order.order.id, ...proof });
              trackPaidEnrollment(order.order.id);
              setIsPaymentBusy(false);
              onNavigatePage?.(
                `/learn/${encodeURIComponent(getCourseRouteKey(course))}`,
              );
            } catch {
              // The gateway has taken the payment; only our confirmation
              // call failed. The server still fulfils the order from the
              // gateway webhook or its recovery cycle, so wait for that
              // rather than telling the learner to pay again.
              await confirmPaidOrder(order.order.id);
            }
          },
          onDismissed: () => {
            // A payment that went through is being confirmed; the gateway
            // closing its own window afterwards is not a cancellation.
            const confirmation = paymentConfirmationRef.current;
            if (confirmation && !confirmation.signal.aborted) return;
            trackAnalyticsEvent("payment_result", {
              courseId: course.id,
              orderId: order.order.id,
              outcome: "dismissed",
            });
            setPaymentError(
              "The payment window was closed before the payment was completed. You can try again whenever you are ready.",
            );
            releaseThisOrder();
          },
          // The window never came up, so nothing can have been paid in it:
          // the order is let go and the button given back with the reason.
          onBlocked: (message) => {
            trackAnalyticsEvent("payment_result", {
              courseId: course.id,
              orderId: order.order.id,
              outcome: "blocked",
            });
            setPaymentError(message);
            releaseThisOrder();
          },
          onClosedUnanswered: () =>
            void followUpUnansweredClose(order.order.id),
        },
      );
      trackAnalyticsEvent("checkout_step", {
        courseId: course.id,
        orderId: order.order.id,
        step: "gateway_opened",
      });
    } catch (error) {
      // The server asks for the number of a new account that has none.
      if (
        (error as { code?: string } | null)?.code ===
        "PHONE_VERIFICATION_REQUIRED"
      ) {
        setIsPaymentBusy(false);
        setPhoneGate({
          amount: voluntaryContributionAmount,
          couponCode: couponOverride,
        });
        trackAnalyticsEvent("checkout_step", {
          courseId: course.id,
          step: "phone_verification",
        });
        return;
      }
      trackAnalyticsEvent("checkout_step", {
        courseId: course.id,
        step: "order_failed",
        outcome: (error as { code?: string } | null)?.code ?? "error",
      });
      setPaymentError(
        readCheckoutStartError(
          error,
          "Checkout could not be started. Please retry.",
        ),
      );
      setIsPaymentBusy(false);
    }
  };

  // A purchase started before signing in (see pendingPurchase.ts) carries
  // on by itself once the buyer is signed in and the page knows the course
  // is still theirs to buy: the mobile number first where it is asked for,
  // then the payment window. Someone who turns out to own or manage the
  // course is shown that instead (the page drops the press).
  const canResumePurchase =
    Boolean(user) &&
    viewerKnown &&
    !isReadOnlyPreview &&
    !isCreatorNormal &&
    !isEnrolled &&
    !isInvitationOnly;
  const resumePendingPurchase = useEffectEvent(() => {
    const pending = takePendingPurchase(buyCourseId);
    if (!pending) return;
    trackAnalyticsEvent("checkout_step", {
      courseId: course.id,
      step: "resumed_after_sign_in",
    });
    // The guest's coupon goes back on the card as well; the order is made
    // with it either way.
    if (pending.couponCode && !appliedCoupon) {
      void applyCouponCode(pending.couponCode);
    }
    void handlePayNow(pending.amount, {
      couponCode: pending.couponCode,
      resumed: true,
    });
  });
  useEffect(() => {
    if (canResumePurchase) resumePendingPurchase();
  }, [canResumePurchase]);

  // Closing the login pop-up without signing in drops the press: signing in
  // later, some other way, is not taken to mean paying. Signing in closes
  // the pop-up too, about when the session reaches this page, so only a
  // pop-up that closed with nobody signed in a moment later counts.
  const location = useLocation();
  const loginOpen = new URLSearchParams(location.search).has(
    LOGIN_DIALOG_PARAM,
  );
  const loginWasOpenRef = useRef(false);
  useEffect(() => {
    if (loginOpen) {
      loginWasOpenRef.current = true;
      return undefined;
    }
    if (!loginWasOpenRef.current) return undefined;
    loginWasOpenRef.current = false;
    const timer = window.setTimeout(() => {
      if (!authStore.getState().user) forgetPendingPurchase(buyCourseId);
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [loginOpen, buyCourseId]);

  // "Pay Now", with a card for its icon: the amount stands on the bar
  // beside the button. A buyer's own, higher amount is still named, and a
  // coupon that leaves nothing to pay says so instead.
  const paidCtaLabel = (payable: number, currency: string) =>
    payable === 0
      ? "Enroll for Free"
      : voluntaryAmount > baseNumericPrice
        ? `Pay ${formatPriceWithCurrency(payable, currency)} & Enroll`
        : "Pay Now";

  let ctaLabel = "Continue Learning";
  let ctaIcon: React.ReactNode = (
    <Play size="1.15em" weight="fill" className="shrink-0" aria-hidden="true" />
  );
  let ctaDisabled = false;
  let ctaOnClick: (() => void) | undefined = () => {
    if (onNavigatePage) {
      onNavigatePage(`/learn/${encodeURIComponent(getCourseRouteKey(course))}`);
    }
  };

  // An enrolled student has nothing left to buy; offering a coupon next to
  // "Continue Learning" suggested there was still something to pay for.
  const showApplyCoupon =
    !isCreatorNormal && !isFree && !isEnrolled && !isInvitationOnly;

  // A code copied somewhere else is used by pasting it anywhere on the page
  // (Ctrl+V), without opening the field first: the field opens with the
  // code in it and the code is tried at once. A good one is applied; a bad
  // one stays in the field with what is wrong with it. Pasting into the
  // coupon field does the same. Text pasted into any other field is that
  // field's, and what cannot be a code (a sentence, a link) is ignored.
  // With a coupon already applied, a different pasted code takes its place
  // only if it is good; otherwise the applied one stays and the bar says
  // why the new one was refused.
  const tryPastedCoupon = useEffectEvent((event: ClipboardEvent) => {
    if (event.defaultPrevented || couponBusy || isPaymentBusy) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    const inCouponField = Boolean(target?.closest("[data-coupon-code-input]"));
    if (
      !inCouponField &&
      target &&
      (target.isContentEditable || target.closest("input, textarea, select"))
    ) {
      return;
    }
    const code = readPastedCouponCode(
      event.clipboardData?.getData("text/plain"),
    );
    if (!code || code === appliedCoupon?.code) return;
    // In the coupon field the code is put there from here, not typed in a
    // second time by the browser.
    event.preventDefault();
    if (!appliedCoupon) {
      setCouponInputOpen(true);
      setCouponCodeInput(code);
    }
    void applyCouponCode(code);
  });
  // Not in the course editor's preview: nothing is bought from there.
  const listensForPastedCoupon = showApplyCoupon && !isPreview;
  useEffect(() => {
    if (!listensForPastedCoupon) return undefined;
    const onPaste = (event: ClipboardEvent) => tryPastedCoupon(event);
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [listensForPastedCoupon]);
  const isCustomUnderPrice =
    !isFree &&
    selectedPreset === "custom" &&
    voluntaryAmount > 0 &&
    voluntaryAmount < baseNumericPrice;
  // The custom box holds something that is not a whole number ("199.50",
  // "1e5", "abc"). It stays in the box as typed and nothing can be paid or
  // enrolled until it is corrected: the amount is 0 meanwhile, and paying
  // the catalogue price next to a box that says otherwise would be a
  // different mistake.
  const isCustomAmountUnreadable =
    selectedPreset === "custom" &&
    readCustomAmount(customAmountInput, MAX_VOLUNTARY_AMOUNT).kind ===
      "unreadable";
  // Why the amount in the custom box cannot be used. The pay button is
  // disabled for an unreadable amount and for one under the price; without
  // this nothing said why. Derived from the box, so it stays for as long as
  // the box is wrong.
  const customAmountMessage =
    selectedPreset !== "custom"
      ? null
      : isCustomAmountUnreadable
        ? "Enter a whole number, with no decimals or symbols."
        : (customAmountError ??
          (isCustomUnderPrice
            ? `The least you can pay for this course is ${formatPriceWithCurrency(baseNumericPrice, courseCurrency)}.`
            : null));

  if (isCreatorNormal || isEnrolled) {
    // 1. Creator viewing their course normally or already enrolled student:
    // Show only "Continue Learning". Clicking it opens the course player.
    // Do not show Pay Now or Apply Coupon.
    ctaLabel = "Continue Learning";
    ctaIcon = (
      <Play
        size="1.15em"
        weight="fill"
        className="shrink-0"
        aria-hidden="true"
      />
    );
    ctaDisabled = false;
    ctaOnClick = () => {
      if (onNavigatePage) {
        onNavigatePage(
          `/learn/${encodeURIComponent(getCourseRouteKey(course))}`,
        );
      }
    };
  } else if (isPreview) {
    // 2. Creator Preview:
    if (isFree) {
      if (voluntaryAmount > 0) {
        ctaLabel = `Pay ${formatPriceWithCurrency(voluntaryAmount, courseCurrency)} & Enroll`;
        ctaIcon = (
          <Heart
            size="1.15em"
            weight="fill"
            className="shrink-0 text-rose-300"
            aria-hidden="true"
          />
        );
      } else {
        ctaLabel = "Enroll for Free";
        ctaIcon = <HoverFillIcon icon={BookOpen} />;
      }
    } else {
      const payable =
        voluntaryAmount > baseNumericPrice ? voluntaryAmount : baseNumericPrice;
      ctaLabel = paidCtaLabel(payable, courseCurrency);
      ctaIcon = <PayCardIcon />;
    }
    ctaDisabled = false;
    ctaOnClick = undefined; // Preview actions stay non-functional.
  } else {
    // 3. Student / Learner (not yet enrolled):
    if (isFree) {
      if (voluntaryAmount > 0) {
        ctaLabel = isPaymentBusy
          ? "Processing…"
          : `Pay ${formatPriceWithCurrency(voluntaryAmount, courseCurrency)} & Enroll`;
        ctaIcon = isPaymentBusy ? (
          <CircleNotch
            size="1.15em"
            className="animate-spin shrink-0"
            aria-hidden="true"
          />
        ) : (
          <Heart
            size="1.15em"
            weight="fill"
            className="shrink-0 text-rose-300"
            aria-hidden="true"
          />
        );
        ctaDisabled = isPaymentBusy;
        ctaOnClick = () => handlePayNow(voluntaryAmount);
      } else {
        ctaLabel = isPaymentBusy ? "Enrolling…" : "Enroll for Free";
        ctaIcon = isPaymentBusy ? (
          <CircleNotch
            size="1.15em"
            className="animate-spin shrink-0"
            aria-hidden="true"
          />
        ) : (
          <HoverFillIcon icon={BookOpen} />
        );
        ctaDisabled = isPaymentBusy;
        ctaOnClick = () => handlePayNow(0);
      }
    } else {
      const payable =
        voluntaryAmount > baseNumericPrice ? voluntaryAmount : baseNumericPrice;
      const finalPayable = appliedCoupon ? appliedCoupon.totalAmount : payable;
      ctaLabel = isPaymentBusy
        ? "Processing…"
        : paidCtaLabel(finalPayable, appliedCoupon?.currency ?? courseCurrency);
      ctaIcon = isPaymentBusy ? (
        <CircleNotch
          size="1.15em"
          className="animate-spin shrink-0"
          aria-hidden="true"
        />
      ) : (
        <PayCardIcon />
      );
      ctaDisabled = isPaymentBusy || isCustomUnderPrice;
      ctaOnClick = () => {
        if (isCustomUnderPrice) {
          setPaymentError(
            `Amount cannot be less than the course price (${formatPriceWithCurrency(baseNumericPrice, courseCurrency)}).`,
          );
          return;
        }
        handlePayNow(
          voluntaryAmount > baseNumericPrice ? voluntaryAmount : undefined,
        );
      };
    }

    // Free or paid: no payment and no enrolment while the custom box holds
    // text that is not an amount. The message under the box says why.
    if (isCustomAmountUnreadable) {
      ctaDisabled = true;
      ctaOnClick = undefined;
    }

    // The coupon total on the card belongs to an earlier amount, and the one
    // for the amount now chosen has been asked for. Until it arrives the
    // button names no price and takes no payment: a click here used to send
    // the new amount under the old total. It ends when the new total
    // arrives, or when the coupon comes off because it could not be had.
    if (couponTotalIsStale) {
      ctaDisabled = true;
      ctaOnClick = undefined;
      if (!isPaymentBusy) {
        ctaLabel = "Updating total…";
        ctaIcon = (
          <CircleNotch
            size="1.15em"
            className="animate-spin shrink-0"
            aria-hidden="true"
          />
        );
      }
    }
  }

  const includingCoursePath = includingCourse
    ? `/courses/${encodeURIComponent(includingCourse.slug)}/overview`
    : undefined;
  if (includingCourse && includingCoursePath) {
    ctaLabel = includingCourse.title;
    ctaDisabled = false;
    ctaOnClick = () => onNavigatePage?.(includingCoursePath);
  }

  const priceLabel = isFree
    ? originalPrice
      ? basePrice
      : "Free"
    : displayPrice;
  const priceBadge =
    (isFree ? originalPrice : true) && displayDiscount
      ? displayDiscount
      : undefined;

  return (
    <CoursePriceBar
      price={
        isCreatorNormal
          ? undefined
          : includingCourse
            ? {
                label: "Free",
                sizeClassName: priceTextClasses[priceSizeVariant],
                note: (
                  <FreeWithCourseNote
                    title={includingCourse.title}
                    href={includingCoursePath}
                    onNavigate={onNavigatePage}
                  />
                ),
              }
            : {
                label: priceLabel,
                sizeClassName: priceTextClasses[priceSizeVariant],
                struckThrough: struckThroughPrice,
                badge: priceBadge,
                // The only saving shown, and it is the coupon's.
                badgeIsCoupon: Boolean(
                  priceBadge && appliedCoupon && !couponOnTopOfSale,
                ),
                couponBadge:
                  priceBadge && couponOnTopOfSale
                    ? couponSavingLabel
                    : undefined,
              }
      }
      priceBreakdown={
        priceBreakdown
          ? {
              ...priceBreakdown,
              totalSizeClassName: priceTextClasses[priceSizeVariant],
            }
          : undefined
      }
      coupon={
        appliedCoupon || showApplyCoupon
          ? {
              applied: appliedCoupon ? { code: appliedCoupon.code } : null,
              isOpen: couponInputOpen,
              code: couponCodeInput,
              busy: couponBusy,
              onOpen: () => {
                setCouponInputOpen(true);
                setCouponError(null);
              },
              onClose: () => {
                setCouponInputOpen(false);
                setCouponError(null);
              },
              onCodeChange: (code) => {
                setCouponCodeInput(code);
                setCouponError(null);
              },
              onApply: handleApplyCoupon,
              onRemove: handleRemoveCoupon,
            }
          : undefined
      }
      // Said beside the open field, and under the bar when there is no
      // open field: a coupon that came off by itself would otherwise give
      // no reason at all, and neither would a pasted code that was refused
      // while another coupon is applied.
      couponError={couponError}
      action={{
        label: ctaLabel,
        icon: ctaIcon,
        disabled: ctaDisabled,
        onClick: ctaOnClick,
        ...(includingCoursePath
          ? { link: { href: includingCoursePath, eyebrow: "Enroll in" } }
          : {}),
      }}
      closedMessage={
        isInvitationOnly && !includingCourse
          ? INVITATION_ONLY_MESSAGE
          : undefined
      }
      notice={paymentNotice}
      error={paymentError}
      onDismissError={() => setPaymentError(null)}
      perks={perksList}
      includedCourses={
        includedCourses && includedCourses.length > 0 ? (
          <IncludedCoursesList
            courses={includedCourses}
            onOpenCourse={onNavigatePage}
          />
        ) : undefined
      }
      checkoutNote={isPaidPurchase ? coursePurchaseCheckoutNote : undefined}
      guarantee={isPaidPurchase ? coursePurchaseGuarantee : undefined}
    >
      {SUPPORT_AMOUNTS_OFFERED &&
      !isCreatorNormal &&
      !isEnrolled &&
      !isInvitationOnly ? (
        <CourseSupportAmountPicker
          isFree={isFree}
          basePrice={baseNumericPrice}
          currency={courseCurrency}
          selectedPreset={selectedPreset}
          voluntaryAmount={voluntaryAmount}
          customAmountInput={customAmountInput}
          customAmountMessage={customAmountMessage}
          onSelectPreset={setSelectedPreset}
          onVoluntaryAmountChange={setVoluntaryAmount}
          onCustomAmountInputChange={setCustomAmountInput}
          onCustomAmountErrorChange={setCustomAmountError}
        />
      ) : null}
      {phoneGate ? (
        <Suspense fallback={null}>
          <PhoneVerificationDialog
            purpose={isFree && !phoneGate.amount ? "enroll" : "pay"}
            savedPhoneNo={
              currentUser.data && !currentUser.data.mobileVerified
                ? currentUser.data.phoneNo
                : null
            }
            onClose={() => setPhoneGate(null)}
            onVerified={() => {
              const { amount, couponCode } = phoneGate;
              setPhoneGate(null);
              void handlePayNow(amount, { phoneChecked: true, couponCode });
            }}
          />
        </Suspense>
      ) : null}
    </CoursePriceBar>
  );
}

interface CourseAboutCardProps {
  description?: string;
  /** For someone who manages the course: opens the editor's Basics tab. */
  onEdit?: () => void;
  isReadOnlyPreview?: boolean;
}

/**
 * Line height × clamp lines = collapsed max-height in px. Seven: about
 * three lines whole (the paragraphs' spacing takes some of it) and two
 * fading out under them (it was five, which left room for half a line to
 * fade, until 2026-10-15).
 */
const CLAMP_LINES = 7;
const LINE_HEIGHT_PX = 0.92 * 16 * 1.65; // font-size × line-height ≈ 24.3 px

/**
 * The cut description's fade: whole until 4.5rem above the cut, then easing
 * out across the two lines over "See more", dimmer and then fainter, and
 * gone 0.875rem above the cut, in the space before the next paragraph, so
 * nothing shows beside "See more" (which rises over the text: its
 * `-mt-7`).
 */
const aboutFadeClasses =
  "[mask-image:linear-gradient(to_bottom,#000_calc(100%_-_4.5rem),rgb(0_0_0/0.75)_calc(100%_-_3.625rem),rgb(0_0_0/0.5)_calc(100%_-_2.75rem),rgb(0_0_0/0.32)_calc(100%_-_1.875rem),rgb(0_0_0/0.15)_calc(100%_-_1.25rem),transparent_calc(100%_-_0.875rem))]";

function CourseAboutCard({ description, onEdit }: CourseAboutCardProps) {
  const hasDescription = Boolean(description && description.trim());
  const [expanded, setExpanded] = useState(false);
  const [needsClamp, setNeedsClamp] = useState(() => {
    if (!description) return false;
    return (
      description.split("\n").length > CLAMP_LINES || description.length > 250
    );
  });
  const contentRef = (node: HTMLDivElement | null) => {
    if (!node) return;
    const collapsedMax = Math.round(LINE_HEIGHT_PX * CLAMP_LINES);
    setNeedsClamp(node.scrollHeight > collapsedMax + 4);
  };

  const collapsedMaxHeight = `${Math.round(LINE_HEIGHT_PX * CLAMP_LINES)}px`;

  // A box, the page's last: heading, the description, and "See more" once
  // it is cut. Cut, the text itself fades out over its last four lines or
  // so, slowly at first and then faster, so no line stops short at full
  // strength (it was a 3rem overlay in the box's colour until 2026-10-15,
  // which faded only the last line).
  return (
    <section
      className={`${overviewCardClasses} ${overviewCardPaddingClasses}`}
      aria-labelledby="cov-about-heading"
      data-fixed-radius
    >
      <div className={bandHeaderClasses}>
        <h2 id="cov-about-heading" className={bandTitleClasses}>
          About this course
        </h2>
        {onEdit ? (
          <button type="button" className={bandLinkClasses} onClick={onEdit}>
            <PencilSimple size={15} weight="bold" aria-hidden="true" />
            <span>Edit about</span>
          </button>
        ) : null}
      </div>

      {hasDescription ? (
        <div className="mt-3.5 flex flex-col gap-2.5">
          <div className="relative">
            <div
              ref={contentRef}
              className={`cov-prose overflow-hidden text-[0.92rem] leading-[1.65] text-(--text-secondary) transition-[max-height] duration-300 ease-in-out ${
                needsClamp && !expanded ? aboutFadeClasses : ""
              }`}
              style={{
                maxHeight:
                  needsClamp && !expanded ? collapsedMaxHeight : "9999px",
              }}
            >
              <DiscussionMarkdown
                content={createDiscussionDraft(
                  formatPlainDescription(description!),
                )}
                label="About this course"
                // The description is written with single line breaks; they
                // are kept as lines instead of being run into one paragraph.
                // One written as plain lines is spaced out first (see
                // `formatPlainDescription`).
                preserveSoftBreaks
                className="max-w-none [&_p]:my-2.5 [&>:first-child]:mt-0"
              />
            </div>
          </div>

          {needsClamp && (
            <button
              type="button"
              data-testid="description-toggle"
              onClick={() => setExpanded((prev) => !prev)}
              // While the text is cut, it rises over the faint end of the
              // fade, so it sits just under the line that is fading out.
              className={`${bandLinkClasses} relative self-start ${
                expanded ? "" : "-mt-7"
              }`}
            >
              {expanded ? "See less" : "See more"}
              <CaretDown
                size={13}
                weight="bold"
                className={`transition-transform duration-200 ${
                  expanded ? "rotate-180" : ""
                }`}
                aria-hidden="true"
              />
            </button>
          )}
        </div>
      ) : (
        <p
          className="m-0 mt-3.5 text-[0.9rem] text-(--muted)"
          data-testid="course-description-empty"
        >
          No description available yet
        </p>
      )}
    </section>
  );
}

// ─── main page ───────────────────────────────────────────────────────────────

export interface CourseOverviewPageProps {
  courseSlug?: string | undefined;
  /** The course as the page was built with it (see `useCoursePageData`). */
  initialCurriculum?: CourseCurriculumPreview;
  onNavigateCourses?: () => void;
  /** The menu page the back link returns to, as the menu names it. */
  backSection?: string;
  onNavigatePage?: NavigateTo;
  onSelectLesson?: (lessonNumber: number) => void;
  role?: CourseRole;
  isCreator?: boolean;
  isPaidCourse?: boolean;
  // API Preview Data
  previewData?: CourseEditorDataResponse;
  categories?: Category[];
  // Custom overview data override for backwards compatibility or tests
  customCourse?: Course;
  customInstructor?: string;
  customDescription?: string;
  customShortDescription?: string;
  customCategoryName?: string;
  customLanguage?: string;
  customSections?: CourseSection[];
  customIncludes?: CourseInclude[];
  customInclusions?: string[];
  customPricing?: CourseOverviewPricingProps;
  customTrailerMediaId?: string | null;
  isReadOnlyPreview?: boolean;
  /**
   * Whether the session has answered and, for someone signed in, which view
   * they are in (learner or manager). Passed by the course page's own
   * route; left out where there is nobody to wait for (the editor's
   * preview), which is the same as true. See `courseViewerState`.
   */
  viewerSettled?: boolean;
  /**
   * Nothing has answered yet and nothing remembers a session on this
   * browser: the visitor is taken for a guest meanwhile.
   */
  presumeGuest?: boolean;
}

export interface AdaptedOverviewData {
  course: Course;
  description: string;
  shortDescription: string | undefined;
  categoryName: string | undefined;
  language: string | undefined;
  sections: CourseSection[];
  /** The course's "This course includes" lines; absent on an old page. */
  inclusions: CourseIncludeLine[] | undefined;
  pricing: CourseOverviewPricingProps;
  instructorName: string | undefined;
  trailerMediaId: string | null;
  /**
   * The overview's `canSelfEnroll`. Absent for the editor's preview, which
   * is built from the course's saved settings rather than from an overview.
   */
  canSelfEnroll?: boolean;
  /** The overview's `accessValidity`: how long the course stays with a learner. */
  accessValidity?: CourseOverviewResponse["accessValidity"];
  /** The overview's `includedWith`, for a linked-only course. */
  includedWith?: CourseOverviewResponse["includedWith"];
  /** The overview's `includedCourses`: the courses that come free with it. */
  includedCourses?: CourseOverviewResponse["includedCourses"];
}

/**
 * A course's stored "This course includes" lines, in their order. Absent
 * (a page built before lines were stored) stays absent, so the card falls
 * back to the standard lines.
 */
function toCourseIncludeLines(
  includes:
    ReadonlyArray<CourseIncludeLine & { position: number }> | null | undefined,
): CourseIncludeLine[] | undefined {
  if (!Array.isArray(includes)) return undefined;
  return includes
    .slice()
    .sort((a, b) => a.position - b.position)
    .filter((line) => line.text.trim())
    .map(({ text, detail, icon, color, kind }) => ({
      text: text.trim(),
      detail,
      icon,
      color,
      kind,
    }));
}

export function adaptCourseOverviewResponse(
  overview: CourseOverviewResponse,
  defaultInstructorName: string,
): AdaptedOverviewData {
  const c = overview.course;
  const totalSections =
    overview.stats?.totalSections ?? overview.sections.length;
  const totalLessons =
    overview.stats?.totalLessons ??
    overview.sections.reduce((acc, sec) => acc + (sec.lessons?.length ?? 0), 0);

  const difficultyStr = c.difficulty
    ? c.difficulty.charAt(0).toUpperCase() + c.difficulty.slice(1)
    : "";

  const resolvedCategoryName = overview.category?.name;
  const resolvedLanguage = getLanguageLabel(overview.settings?.language);

  const showInstructor = overview.settings?.showInstructorName !== false;
  const resolvedInstructorName = showInstructor
    ? c.instructorAlias?.trim() ||
      overview.creator?.displayName ||
      defaultInstructorName
    : undefined;

  const resolvedDurationSeconds = resolveCourseDurationSeconds(
    overview.stats?.totalDurationSeconds,
    overview.settings?.estimatedDuration,
  );
  const resolvedDuration = formatCourseDuration(resolvedDurationSeconds);

  const resolvedThumbnail = c.thumbnailUrl || "";

  const adaptedCourse: Course = {
    id: c.id,
    slug: c.slug,
    title: c.title || "Untitled Course",
    description: c.description || c.shortDescription || "",
    level: (difficultyStr || "Beginner") as CourseLevel,
    category: (resolvedCategoryName || "Development") as CourseCategory,
    sections: totalSections,
    lectures: totalLessons,
    progress: null,
    enrolled: false,
    duration: resolvedDuration,
    students: 0,
    thumbnail: resolvedThumbnail,
    thumbnailSrcSet: c.thumbnailSrcSet,
    banner: c.bannerUrl || undefined,
    bannerSrcSet: c.bannerSrcSet,
    lifecycleStatus: (c.status === "published" || c.status === "archived"
      ? c.status
      : "draft") as CourseLifecycleStatus,
    creatorId: c.creatorId ?? overview.creator?.id ?? null,
  };

  let sequentialLessonIndex = 1;
  const adaptedSections: CourseSection[] = (overview.sections || [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((sec, secIdx) => ({
      id: secIdx + 1,
      sectionId: sec.id,
      title: sec.title || `Section ${secIdx + 1}`,
      progress: `0/${sec.lessons?.length ?? 0}`,
      lessons: (sec.lessons || [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((les) => {
          const lessonNumber = sequentialLessonIndex++;
          return [
            lessonNumber,
            les.title || `Lesson ${lessonNumber}`,
            les.durationSeconds && les.durationSeconds > 0
              ? formatDuration(les.durationSeconds)
              : "",
            "todo" as const,
            les.isPreview,
            les.contentType ?? "video",
          ];
        }),
    }));

  const finalPerks = toCourseIncludeLines(overview.includes);

  let pricingProps: CourseOverviewPricingProps = toOverviewPricingProps(
    overview.pricing,
  );

  return {
    course: adaptedCourse,
    description: c.description || "",
    shortDescription: c.shortDescription?.trim() || undefined,
    categoryName: resolvedCategoryName,
    language: resolvedLanguage,
    sections: adaptedSections,
    inclusions: finalPerks,
    pricing: pricingProps,
    instructorName: resolvedInstructorName,
    trailerMediaId: c.trailerMediaId ?? null,
    canSelfEnroll: overview.canSelfEnroll,
    accessValidity: overview.accessValidity,
    includedWith: overview.includedWith,
    includedCourses: overview.includedCourses,
  };
}

export function adaptPreviewDataToOverview(
  previewData: CourseEditorDataResponse,
  serverCategories: Category[],
  defaultInstructorName: string,
): AdaptedOverviewData {
  const c = previewData.course;
  const totalSections = previewData.sections.length;
  const totalLessons = previewData.sections.reduce(
    (acc, sec) => acc + (sec.lessons?.length ?? 0),
    0,
  );

  const difficultyStr = c.difficulty
    ? c.difficulty.charAt(0).toUpperCase() + c.difficulty.slice(1)
    : "";

  const resolvedCategoryName = c.categoryId
    ? serverCategories.find((cat) => cat.id === c.categoryId)?.name
    : undefined;

  const resolvedLanguage = getLanguageLabel(previewData.settings?.language);

  const showInstructor = previewData.settings?.showInstructorName !== false;
  const resolvedInstructorName = showInstructor
    ? c.instructorAlias?.trim() || defaultInstructorName
    : undefined;

  const totalDurationSeconds = resolveCourseDurationSeconds(
    previewData.course.totalDurationSeconds,
    previewData.settings?.estimatedDuration,
  );

  const adaptedCourse: Course = {
    id: c.id,
    slug: c.slug,
    title: c.title || "Untitled Course",
    description: c.description || "",
    level: (difficultyStr || "Beginner") as CourseLevel,
    category: (resolvedCategoryName || "") as CourseCategory,
    sections: totalSections,
    lectures: totalLessons,
    progress: null,
    enrolled: false,
    duration: formatCourseDuration(totalDurationSeconds),
    students: 0,
    thumbnail: c.thumbnailUrl || "",
    thumbnailSrcSet: c.thumbnailSrcSet,
    banner: c.bannerUrl || undefined,
    bannerSrcSet: c.bannerSrcSet,
    lifecycleStatus: (c.status === "published" || c.status === "archived"
      ? c.status
      : "draft") as CourseLifecycleStatus,
    creatorId: c.creatorId ?? null,
  };

  let sequentialLessonIndex = 1;
  const adaptedSections: CourseSection[] = (previewData.sections || [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((sec, secIdx) => ({
      id: secIdx + 1,
      sectionId: sec.id,
      title: sec.title || `Section ${secIdx + 1}`,
      progress: `0/${sec.lessons?.length ?? 0}`,
      lessons: (sec.lessons || [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((les) => {
          const lessonNumber = sequentialLessonIndex++;
          return [
            lessonNumber,
            les.title || `Lesson ${lessonNumber}`,
            les.durationSeconds && les.durationSeconds > 0
              ? formatDuration(les.durationSeconds)
              : "",
            "todo" as const,
            les.isPreview,
            les.contentType ?? "video",
          ];
        }),
    }));

  const finalPerks = toCourseIncludeLines(previewData.includes);

  const pricingProps: CourseOverviewPricingProps = toOverviewPricingProps(
    previewData.pricing,
  );

  return {
    course: adaptedCourse,
    description: c.description || "",
    shortDescription: c.shortDescription?.trim() || undefined,
    categoryName: resolvedCategoryName,
    language: resolvedLanguage,
    sections: adaptedSections,
    inclusions: finalPerks,
    pricing: pricingProps,
    instructorName: resolvedInstructorName,
    trailerMediaId: c.trailerMediaId ?? null,
  };
}

export function CourseOverviewPage(props: CourseOverviewPageProps) {
  const { courseSlug: routeCourseSlug } = useParams();
  const courseSlug = props.courseSlug ?? routeCourseSlug;
  // A partial access link: `?access=<its slug>` sells part of the course.
  const pageLocation = useLocation();
  const offerSlug = new URLSearchParams(pageLocation.search).get("access");
  const offerQuery = usePartialAccessOffer(courseSlug, offerSlug);
  const partialOffer: PartialOfferState = !offerSlug
    ? null
    : offerQuery.data
      ? { status: "ready", offer: offerQuery.data }
      : offerQuery.isError
        ? { status: "missing" }
        : { status: "loading" };
  const serverCategories = props.categories ?? [];
  const authUser = useAuthStore((s) => s.user);
  const defaultInstructorName =
    authUser?.displayName || authUser?.username || "Instructor";

  const awaitsAccess = Boolean(authUser) && props.role !== "creator";
  const {
    overview: apiOverview,
    isLoading: isOverviewLoading,
    error: overviewError,
    refetch: refetchOverview,
    access,
    accessPending,
    totalSections,
    sectionsComplete,
    requestAllSections,
    prefetchAllSections,
  } = useCoursePageData({
    courseSlug,
    preview: props.initialCurriculum,
    enabled: !props.previewData && !props.customCourse && Boolean(courseSlug),
    awaitsAccess,
    viewerKind:
      props.role === "creator" || props.viewerSettled === false
        ? null
        : authUser
          ? "learner"
          : "guest",
  });

  // If previewData is provided, adapt it cleanly from persisted server state
  const adaptedFromPreview = props.previewData
    ? adaptPreviewDataToOverview(
        props.previewData,
        serverCategories,
        defaultInstructorName,
      )
    : null;

  const adaptedFromOverview = apiOverview
    ? adaptCourseOverviewResponse(apiOverview, defaultInstructorName)
    : null;

  const activeAdapted = adaptedFromPreview ?? adaptedFromOverview;

  const course = activeAdapted?.course ?? props.customCourse;

  // What the parts of the page that depend on the viewer may show yet. The
  // viewer's access answer is the last one in: whether this course is
  // theirs decides between the price and their progress.
  const viewer: CourseViewerState =
    props.viewerSettled === undefined ||
    props.previewData ||
    props.customCourse ||
    props.isReadOnlyPreview
      ? "known"
      : !props.viewerSettled
        ? props.presumeGuest
          ? "presumed-guest"
          : "pending"
        : accessPending
          ? "pending"
          : "known";

  // The viewer's enrolment, from the same answer that decides which lessons
  // open to them.
  const enrolment = access?.enrolled ? access.progress : null;
  const courseWithEnrollment = useMemo(() => {
    if (!course) return undefined;
    return {
      ...course,
      enrolled: Boolean(enrolment) || course.enrolled,
      progress: enrolment?.percent ?? course.progress,
      started: enrolment?.started ?? false,
    };
  }, [course, enrolment]);

  if (
    isOverviewLoading &&
    !course &&
    !props.previewData &&
    !props.customCourse
  ) {
    return (
      <CourseOverviewSkeleton
        onNavigateCourses={props.onNavigateCourses}
        heroPlacement={props.isReadOnlyPreview ? "card" : "edge"}
      />
    );
  }

  // A failed request is not a missing course. Saying "not found" for a
  // dropped connection or a server error told people a course they own
  // had been removed.
  if (!courseWithEnrollment && overviewError && overviewError.status !== 404) {
    return (
      <CourseLoadError
        onRetry={() => void refetchOverview()}
        onBack={props.onNavigateCourses}
      />
    );
  }

  if (!courseWithEnrollment) {
    return (
      <div className="w-full max-w-275 mx-auto box-border text-(--text)">
        <div className="courses-empty">
          <BookOpen size={34} />
          <h2>Course not found</h2>
          <p>
            The course you are looking for does not exist or may have been
            removed.
          </p>
          {props.onNavigateCourses ? (
            <button type="button" onClick={props.onNavigateCourses}>
              Explore courses
            </button>
          ) : props.onNavigatePage ? (
            <button
              type="button"
              onClick={() => props.onNavigatePage?.("/courses")}
            >
              Explore courses
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  const isCourseOwner = Boolean(
    authUser?.id &&
    (course?.creatorId === authUser.id ||
      activeAdapted?.course.creatorId === authUser.id ||
      apiOverview?.creator?.id === authUser.id ||
      apiOverview?.course.creatorId === authUser.id),
  );

  const isCreator =
    props.isCreator ??
    (props.role === "creator"
      ? true
      : props.role === "student"
        ? false
        : isCourseOwner);

  return (
    // A built page holds its first sections only; the controls that show or
    // use the rest fetch it as the reader reaches for them.
    <CurriculumIntentContext.Provider
      value={sectionsComplete ? null : prefetchAllSections}
    >
      <CourseOverviewContent
        {...props}
        key={courseWithEnrollment.id}
        course={courseWithEnrollment}
        courseSlug={courseSlug}
        adaptedFromPreview={activeAdapted}
        isCreator={isCreator}
        viewer={viewer}
        totalSections={totalSections}
        sectionsComplete={sectionsComplete}
        onRequestAllSections={requestAllSections}
        resume={access?.resume}
        partialOffer={partialOffer}
        enrolmentAccess={
          access?.enrolled
            ? {
                accessExpiresAt: access.accessExpiresAt ?? null,
                enrollment: access.enrollment ?? null,
              }
            : null
        }
      />
    </CurriculumIntentContext.Provider>
  );
}

/** What a partial access link (`?access=`) offers, as it is loaded. */
type PartialOfferState =
  | null
  | { status: "loading" }
  | { status: "missing" }
  | { status: "ready"; offer: PartialAccessOffer };

type CourseOverviewContentProps = CourseOverviewPageProps & {
  /** Set when the page was opened from a partial access link. */
  partialOffer?: PartialOfferState;
  course: Course;
  courseSlug: string | undefined;
  adaptedFromPreview: AdaptedOverviewData | null;
  isCreator?: boolean;
  viewer?: CourseViewerState;
  /** How many sections the whole curriculum has. */
  totalSections?: number;
  /** Whether the curriculum holds every section yet. */
  sectionsComplete?: boolean;
  onRequestAllSections?: () => void;
  /** Where an enrolled learner carries on, from the access answer. */
  resume?: CourseAccessResume | null;
  /**
   * An enrolled learner's end of access and their enrolment, from the
   * access answer.
   */
  enrolmentAccess?: {
    accessExpiresAt: string | null;
    enrollment?: CourseAccessEnrollment | null;
  } | null;
};

function CourseOverviewContent({
  course,
  courseSlug,
  adaptedFromPreview,
  onNavigateCourses,
  backSection,
  onNavigatePage,
  onSelectLesson,
  customCourse,
  customDescription,
  customShortDescription,
  customSections,
  customIncludes,
  customInclusions,
  customPricing,
  customTrailerMediaId,
  isReadOnlyPreview = false,
  isCreator = false,
  isPaidCourse: propIsPaidCourse,
  viewer = "known",
  totalSections,
  sectionsComplete = true,
  onRequestAllSections,
  resume,
  enrolmentAccess,
  partialOffer = null,
}: CourseOverviewContentProps) {
  const offer = partialOffer?.status === "ready" ? partialOffer.offer : null;
  // The part is shown against the whole course's price; what it saves is
  // its partial access discount.
  const offerPricing = offer
    ? {
        ...toOverviewPricingProps({
          pricingType: offer.salePrice > 0 ? "paid" : "free",
          price: Math.max(offer.price, offer.salePrice),
          salePrice: offer.salePrice,
          currency: offer.currency,
        }),
        discountName: "Partial access discount",
      }
    : undefined;
  const includedSectionIds = useMemo(
    () => (offer ? new Set(offer.sectionIds) : undefined),
    [offer],
  );
  const user = useAuthStore((state) => state.user);
  // A lesson in the curriculum is readied while the pointer rests on it,
  // and opens playing.
  const lessonRowsIntent = useLessonListOpenIntent(
    isReadOnlyPreview ? null : getCourseRouteKey(course),
  );
  const handleSelectLesson = (lessonNumber: number) => {
    if (isReadOnlyPreview) return;
    onSelectLesson?.(lessonNumber);
    if (!onNavigatePage) return;
    lessonRowsIntent.open(lessonNumber, (opened) =>
      onNavigatePage(getCoursePlayerPath(getCourseRouteKey(course), opened)),
    );
  };
  const locationHash =
    typeof window === "undefined" ? "" : window.location.hash;

  useLayoutEffect(() => {
    if (!locationHash) return undefined;

    let targetId: string;
    try {
      targetId = decodeURIComponent(locationHash.slice(1));
    } catch {
      return undefined;
    }
    if (!targetId) return undefined;

    const revealTarget = () => {
      document.getElementById(targetId)?.scrollIntoView({
        behavior: "auto",
        block: "start",
      });
    };
    revealTarget();
    const frame = window.requestAnimationFrame(revealTarget);
    return () => window.cancelAnimationFrame(frame);
  }, [courseSlug, locationHash]);

  const title =
    adaptedFromPreview?.course.title ?? customCourse?.title ?? course.title;
  const thumbnail =
    adaptedFromPreview?.course.thumbnail ??
    customCourse?.thumbnail ??
    course.thumbnail;
  const shortDescription =
    adaptedFromPreview?.shortDescription ?? customShortDescription ?? undefined;
  const courseSections = adaptedFromPreview?.sections ?? customSections ?? [];
  const activeDescription =
    adaptedFromPreview?.description ?? customDescription ?? course.description;
  const activePricing =
    adaptedFromPreview?.pricing ??
    customPricing ??
    (course.pricing ? { price: course.pricing.price } : undefined);
  const isPaidCourse =
    propIsPaidCourse !== undefined
      ? propIsPaidCourse
      : !isFreeCoursePricing(activePricing);

  const inclusions: CourseIncludeLine[] | undefined = adaptedFromPreview
    ? adaptedFromPreview.inclusions
    : customInclusions !== undefined
      ? Array.from(
          new Set(customInclusions.map((s) => s.trim()).filter(Boolean)),
        ).map((text) => ({ text }))
      : customIncludes !== undefined
        ? Array.from(
            new Set(
              customIncludes
                .map((inc) => inc.label.trim())
                .filter(
                  (label) =>
                    !/^\d+\s+(sections|lectures)/i.test(label) &&
                    !/on-demand content/i.test(label),
                ),
            ),
          ).map((text) => ({ text }))
        : undefined;

  const [openSections, setOpenSections] = useState<Set<number>>(
    // Every section starts closed: the list reads as a table of contents.
    () => new Set(),
  );
  const wishlistTarget = useMemo(
    (): Pick<Course, "id" | "slug"> => ({
      id: course?.id ?? courseSlug ?? "",
      slug: course?.slug ?? courseSlug,
    }),
    [course?.id, course?.slug, courseSlug],
  );
  const wishlisted = useCourseWishlisted(wishlistTarget);
  const toggleWishlistCourse = useToggleWishlistCourse();

  // As in the course content beside a lesson: any number of sections may be
  // open, and opening or closing one moves nothing. The section opens where
  // it is, downwards. (It used to close the others and then scroll to the
  // one opened, which took the page up as they shut and back down again.)
  const toggleSection = (index: number) => {
    setOpenSections((open) => {
      const next = new Set(open);
      if (!next.delete(index)) next.add(index);
      return next;
    });
  };

  // Opens the first `count` sections: the curriculum may show only its
  // first few, and "Expand all" opens what is on the page.
  const expandAllSections = (count: number) => {
    setOpenSections(
      new Set(courseSections.slice(0, count).map((_, index) => index)),
    );
  };

  const collapseAllSections = () => {
    setOpenSections(new Set());
  };

  const toggleWishlist = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      if (isReadOnlyPreview || !wishlistTarget.id) return;
      toggleWishlistCourse(wishlistTarget);
    },
    [isReadOnlyPreview, toggleWishlistCourse, wishlistTarget],
  );

  const trailerMediaId =
    adaptedFromPreview?.trailerMediaId ??
    customTrailerMediaId ??
    (course as { trailerMediaId?: string | null }).trailerMediaId ??
    null;

  // Someone who manages the course has nothing to save for later or to try
  // before buying, and neither has a learner who is already enrolled.
  const managesCourse = isCreator && !isReadOnlyPreview;
  // The editor's tabs, for the manager's "Edit" links.
  const openEditor = (step: "basics" | "curriculum") => () =>
    onNavigatePage?.(
      getCourseEditorPath({ mode: "edit", courseId: course.id, step }),
    );
  // The price as a learner sees it before any coupon, by the purchase
  // bar's own rules: a free course that names a marked price shows that
  // price struck through beside a price of zero and the "Free" tag.
  const managerPriceIsFree = isFreeCoursePricing(activePricing);
  const managerPriceLabel = managerPriceIsFree
    ? activePricing?.originalPrice
      ? (activePricing?.price ?? "Free")
      : "Free"
    : (activePricing?.price ?? "Free");
  const managerPrice: CoursePriceDisplayPrice = {
    label: managerPriceLabel,
    sizeClassName: priceTextClasses[getPriceSizeVariant(managerPriceLabel)],
    struckThrough: activePricing?.originalPrice,
    badge:
      (managerPriceIsFree ? activePricing?.originalPrice : true) &&
      activePricing?.discount
        ? activePricing.discount
        : undefined,
  };
  const isEnrolled = Boolean(user && course.enrolled);
  // A purchase started before signing in is not carried on for a course
  // the buyer turns out to own or manage (see pendingPurchase.ts).
  const ownsOrManages = Boolean(user) && (isEnrolled || managesCourse);
  useEffect(() => {
    if (viewer === "known" && ownsOrManages) forgetPendingPurchase(course.id);
  }, [viewer, ownsOrManages, course.id]);
  // An enrolled learner's play button on the picture opens the lesson they
  // go on with, as the band's button under the hero does (it shares its
  // request for that lesson when the page was not given it).
  const learnerPlays =
    isEnrolled && !managesCourse && viewer === "known" && !isReadOnlyPreview;
  const learnerResumeQuery = useLearningProgressResumeContext(
    getCourseRouteKey(course),
    { enabled: learnerPlays && !resume },
  );
  const learnerPercent = course.progress ?? 0;
  // The lesson the learner carries on with, readied ahead of the press on
  // the picture's play button or the band's "Continue Learning", and once
  // the page is idle, as the home readies its hero's: it is the press this
  // page is most likely to get, and a phone has no hover to ready it on.
  const learnerIntent = useLessonOpenIntent(
    learnerPlays
      ? {
          courseKey: getCourseRouteKey(course),
          lesson: "resume",
          known:
            (resume ?? learnerResumeQuery.data)?.resumeLesson?.lessonNumber ??
            null,
          review: learnerPercent >= 100,
        }
      : null,
  );
  const readyLearnerLesson = learnerIntent.ready;
  useEffect(() => {
    if (!learnerPlays) return undefined;
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(readyLearnerLesson, {
        timeout: 1500,
      });
      return () => window.cancelIdleCallback(handle);
    }
    const timer = window.setTimeout(readyLearnerLesson, 300);
    return () => window.clearTimeout(timer);
  }, [learnerPlays, readyLearnerLesson]);
  const learnerPlayLabel =
    learnerPercent >= 100
      ? "Review course"
      : course.started || learnerPercent > 0
        ? "Continue learning"
        : "Start learning";
  const openLearning = () => {
    if (isReadOnlyPreview || !onNavigatePage) return;
    const courseKey = getCourseRouteKey(course);
    learnerIntent.open((lessonNumber) =>
      onNavigatePage(getCoursePlayerPath(courseKey, lessonNumber)),
    );
  };
  // What a visitor can watch before buying: the lessons a paid course marks
  // as free previews (the ones the curriculum labels "Free").
  const firstFreeLessonNumber = isPaidCourse
    ? courseSections
        .flatMap((section) => section.lessons)
        .find((lesson) => lesson[4])?.[0]
    : undefined;
  // With a trailer the preview is there for everyone. Without one it stands
  // for the free lessons, which only someone who neither manages the course
  // nor holds it is offered: that waits until the viewer is known.
  const previewDependsOnViewer =
    !trailerMediaId && firstFreeLessonNumber !== undefined;
  // While the viewer is not known the guest's preview is in the page, and
  // the document's head shows or hides it (see `courseViewerState`).
  // Which lessons in the curriculum the viewer can play, so only those are
  // readied while the pointer rests on them.
  const lessonIntentFor: LessonIntentFor | undefined = isReadOnlyPreview
    ? undefined
    : (lessonNumber, isPreview) =>
        managesCourse || isEnrolled || isPreview || !isPaidCourse
          ? lessonRowsIntent.handlersFor(lessonNumber)
          : undefined;
  const canPreview =
    Boolean(trailerMediaId) ||
    (!managesCourse && !isEnrolled && firstFreeLessonNumber !== undefined);
  // A visitor's preview is the course's first free lesson, readied ahead of
  // the press and opened playing (a trailer opens as it always has).
  const previewLesson =
    !isReadOnlyPreview &&
    !trailerMediaId &&
    !managesCourse &&
    !isEnrolled &&
    firstFreeLessonNumber !== undefined
      ? firstFreeLessonNumber
      : null;
  const previewIntent = useLessonOpenIntent(
    previewLesson !== null
      ? { courseKey: getCourseRouteKey(course), lesson: previewLesson }
      : null,
  );
  const openPreview = () => {
    if (isReadOnlyPreview || !onNavigatePage) return;
    const courseKey = getCourseRouteKey(course);
    if (previewLesson !== null) {
      previewIntent.open((lessonNumber) =>
        onNavigatePage(getCoursePlayerPath(courseKey, lessonNumber)),
      );
      return;
    }
    onNavigatePage(
      trailerMediaId || firstFreeLessonNumber === undefined
        ? `/learn/${encodeURIComponent(courseKey)}`
        : getCoursePlayerPath(courseKey, firstFreeLessonNumber),
    );
  };

  const openCourse = () => {
    if (isReadOnlyPreview || !onNavigatePage) return;
    onNavigatePage(`/learn/${encodeURIComponent(getCourseRouteKey(course))}`);
  };

  // On the course page the hero touches the frame; in the course editor's
  // preview window it is a card in the column with the rest.
  const hero = (
    <CourseOverviewHero
      placement={isReadOnlyPreview ? "card" : "edge"}
      title={title}
      shortDescription={shortDescription}
      sections={course.sections}
      lessons={course.lectures}
      duration={course.duration}
      thumbnail={thumbnail}
      thumbnailSrcSet={course.thumbnailSrcSet}
      banner={course.banner}
      bannerSrcSet={course.bannerSrcSet}
      onBack={onNavigateCourses}
      // The link names the page it returns to. The course list is "All
      // courses" from here, where one course is open; any other page keeps
      // the name the menu gives it. In the editor's preview it closes the
      // preview.
      backLabel={
        isReadOnlyPreview
          ? "Back to editor"
          : !backSection || backSection === "Courses"
            ? "All courses"
            : backSection
      }
      // No heart for someone who manages the course, nor for a learner who
      // is enrolled in it: a wish list is for courses not yet taken.
      wishlist={
        managesCourse || isEnrolled
          ? undefined
          : {
              wishlisted,
              disabled: isReadOnlyPreview,
              onToggle: toggleWishlist,
            }
      }
      // Someone who manages the course gets the same pill, into the course
      // itself, in place of the preview (the bar under the hero no longer
      // carries an "Open course" button).
      preview={
        managesCourse && viewer === "known"
          ? { onOpen: openCourse, disabled: isReadOnlyPreview, kind: "open" }
          : learnerPlays
            ? {
                onOpen: openLearning,
                disabled: false,
                kind: "open",
                label: learnerPlayLabel,
                intent: learnerIntent.handlers,
              }
            : canPreview
              ? {
                  onOpen: openPreview,
                  disabled: isReadOnlyPreview,
                  intent:
                    previewLesson !== null ? previewIntent.handlers : undefined,
                }
              : undefined
      }
      viewerPlaceholders={
        viewer === "known"
          ? undefined
          : {
              // Pending is a browser that remembers a session, as an
              // expected session is: the same parts, picked by the head.
              for: "expected-session",
              preview: previewDependsOnViewer,
              wishlist: true,
              heldPlay: !isReadOnlyPreview,
            }
      }
    />
  );

  return (
    <div
      data-course-overview
      // What the document's head keys this course's early state on (see
      // `courseCardEarlyState`), as the course cards do.
      data-course-card-id={course.id}
      // On the course page the first box touches the hero; in the editor's
      // preview the hero is a card in the column like the rest.
      className={`flex w-full flex-col text-(--text) ${
        isReadOnlyPreview
          ? "gap-4 p-[36px_24px_48px] max-[900px]:p-[24px_16px_48px] max-[640px]:p-[16px_14px_40px]"
          : overviewPageContainerClasses
      }`}
    >
      {/* The lesson pages readied ahead of a press (see lessonOpenIntent). */}
      {learnerIntent.pageLinks}
      {previewIntent.pageLinks}
      {lessonRowsIntent.pageLinks}
      {/* 1. Title and course facts over the thumbnail */}
      {isReadOnlyPreview ? null : hero}

      <div
        className={`${overviewColumnClasses} ${
          isReadOnlyPreview
            ? ""
            : `${overviewColumnUnderHeroClasses} ${overviewTwoColumnClasses}`
        }`}
        data-fixed-radius
      >
        {isReadOnlyPreview ? hero : null}

        {/* 2. For someone who manages the course, its state and the ways
            into the editor; for an enrolled learner, where they are in the
            course; otherwise the price, the coupon and the button that
            buys it. Which of the three is not known until the viewer is
            (see `courseViewerState`), and a placeholder holds the band's
            place until then: the price and "Pay Now" used to stand there
            for a learner until their enrolments arrived.

            The band is always in the one box, and in the same place in it
            whether the visitor is known or only presumed a guest, so that
            learning which it is does not start the band over (an open
            coupon field would lose what was typed in it).

            On a wide page it is the right column, beside the curriculum,
            and stays in view while the page scrolls. */}
        <div
          className={isReadOnlyPreview ? undefined : overviewBandColumnClasses}
        >
          {/* While the viewer is not known (presumed a guest, or pending)
              the box holds every form the band can take and the document's
              head picks one before the first paint (see
              `courseViewerState`): the guest's band, the learner's progress
              band when this tab's copies say the course is theirs, or the
              placeholder when it has none. The band itself stays the first
              element throughout. */}
          {partialOffer && partialOffer.status !== "loading" ? (
            <PartialAccessNotice
              offer={offer}
              courseTitle={title}
              totalSections={totalSections ?? courseSections.length}
            />
          ) : null}
          <div
            className={
              viewer === "known" ? undefined : presumedGuestOnlyClasses
            }
            data-course-card-early={viewer === "known" ? undefined : "offer"}
          >
            {managesCourse ? (
              <CourseManagerBar
                course={course}
                price={managerPrice}
                onNavigatePage={onNavigatePage}
              />
            ) : isEnrolled ? (
              <CourseLearnerProgressBar
                courseKey={getCourseRouteKey(course)}
                courseTitle={title}
                progress={course.progress ?? 0}
                started={Boolean(course.started)}
                totalLessons={course.lectures}
                resume={resume}
                enrolment={enrolmentAccess}
                onNavigatePage={onNavigatePage}
                openIntent={learnerPlays ? learnerIntent : undefined}
              />
            ) : partialOffer?.status === "loading" ||
              (offer && !offer.onSale) ? (
              // The part's price is not known yet, or it is not sold: the
              // course's own price must not stand in for it.
              offer ? null : (
                <CourseViewerBandPlaceholder />
              )
            ) : (
              <CoursePurchaseSection
                course={course}
                pricing={offerPricing ?? activePricing}
                inclusions={inclusions}
                onNavigatePage={onNavigatePage}
                isReadOnlyPreview={isReadOnlyPreview}
                isCreator={isCreator}
                canSelfEnroll={adaptedFromPreview?.canSelfEnroll}
                includedWith={adaptedFromPreview?.includedWith}
                includedCourses={adaptedFromPreview?.includedCourses}
                viewerKnown={viewer === "known"}
                purchaseCourseId={offer?.courseId}
                purchaseTitle={offer?.title}
              />
            )}
          </div>
          {viewer === "known" ? null : (
            <>
              <div className="hidden" data-course-card-early="held">
                <CourseLearnerProgressBarEarly />
              </div>
              <div className={sessionExpectedOnlyClasses}>
                <CourseViewerBandPlaceholder />
              </div>
            </>
          )}
        </div>

        {/* 3. Course curriculum */}
        <CourseOverviewCurriculum
          onEdit={managesCourse ? openEditor("curriculum") : undefined}
          courseSections={courseSections}
          openSections={openSections}
          onToggleSection={toggleSection}
          onExpandAll={expandAllSections}
          onCollapseAll={collapseAllSections}
          onSelectLesson={handleSelectLesson}
          lessonIntentFor={lessonIntentFor}
          isReadOnlyPreview={isReadOnlyPreview}
          isPaidCourse={isPaidCourse}
          validityLabel={courseValidityLabel(
            adaptedFromPreview?.accessValidity,
            enrolmentAccess,
          )}
          totalSections={totalSections}
          sectionsComplete={sectionsComplete}
          onRequestAllSections={onRequestAllSections}
          includedSectionIds={includedSectionIds}
        />

        {/* 4. About this course, under the curriculum */}
        <CourseAboutCard
          description={activeDescription}
          onEdit={managesCourse ? openEditor("basics") : undefined}
        />
      </div>
    </div>
  );
}
