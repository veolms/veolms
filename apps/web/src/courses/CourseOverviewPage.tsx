import { useLayoutEffect, useState } from "react";
import type { MouseEvent } from "react";
import { useParams } from "react-router";
import {
  ArrowLeft,
  ArrowsInLineVertical,
  ArrowsOutLineVertical,
  BookOpen,
  CaretDown,
  CheckCircle,
  Circle,
  CircleNotch,
  Clock,
  FileText,
  Heart,
  Play,
  PlayCircle,
  ShoppingBag,
  Stack,
  Tag,
  Ticket,
  User,
  X,
} from "@phosphor-icons/react";
import type {
  Category,
  CourseEditorDataResponse,
  CourseOverviewResponse,
} from "@veolms/contracts";
import {
  getCourseRouteKey,
  type Course,
  type CourseLevel,
  type CourseCategory,
  type CourseLifecycleStatus,
  type CourseRole,
} from "./catalogue";
import { CourseThumbnailPlaceholder } from "./CourseThumbnailPlaceholder";
import { formatDuration } from "./courseAdapter";
import type { CourseSection } from "../learning/courseContent";
import type { NavigateTo } from "../routing/navigation";
import { useAuthStore } from "../store/auth.store";
import { useCourseOverview } from "../services/courses";
import {
  useCheckoutPreview,
  useCreateCheckoutOrder,
  useVerifyPayment,
} from "../services/payments";
import { DiscussionMarkdown } from "../learning/discussion-editor/DiscussionMarkdown";
import { createDiscussionDraft } from "../learning/discussion-editor/types";
import { formatDuration, resolveCourseDurationSeconds } from "./courseAdapter";
// ─── Helpers for Currency, Sale Window, Language, and Price Sizing ────────────

export type PriceSizeVariant = "normal" | "medium" | "large" | "xlarge";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

async function loadRazorpay() {
  if (typeof window === "undefined" || window.Razorpay) return;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Unable to load payment checkout."));
    document.head.appendChild(script);
  });
}

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

export function getCurrencySymbol(currency: string = "INR"): string {
  switch (currency.toUpperCase()) {
    case "INR":
      return "₹";
    case "USD":
      return "$";
    case "EUR":
      return "€";
    case "GBP":
      return "£";
    case "CAD":
      return "CA$";
    case "AUD":
      return "A$";
    case "JPY":
      return "¥";
    default:
      return `${currency.toUpperCase()} `;
  }
}

export function formatPriceWithCurrency(
  amount: number,
  currency: string = "INR",
): string {
  const sym = getCurrencySymbol(currency);
  return `${sym}${amount.toLocaleString("en-US")}`;
}

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
}

// ─── sub-components ──────────────────────────────────────────────────────────

interface CurriculumSectionProps {
  section: CourseSection;
  index: number;
  isOpen: boolean;
  onToggle: () => void;
}

function parseDurationLabel(label: string): number {
  const hours = Number(label.match(/(\d+)h/)?.[1] ?? 0);
  const minutes = Number(label.match(/(\d+)m/)?.[1] ?? 0);
  return hours * 3600 + minutes * 60;
}

function CurriculumSectionItem({
  section,
  index,
  isOpen,
  onToggle,
}: CurriculumSectionProps) {
  const panelId = `cov-section-panel-${section.id}`;
  const buttonId = `cov-section-toggle-${section.id}`;
  const lessonCount = section.lessons.length;
  const durationSeconds = section.lessons.reduce(
    (total, lesson) => total + parseDurationLabel(lesson[2]),
    0,
  );
  const durationLabel = durationSeconds > 0 ? formatDuration(durationSeconds) : "";

  return (
    <div
      className={`rounded-xl border bg-(--surface) shadow-(--card-shadow) overflow-hidden transition-[border-color,box-shadow] duration-150 ${
        isOpen
          ? "border-[color-mix(in_srgb,var(--accent)_35%,transparent)]"
          : "border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
      }`}
      role="listitem"
    >
      <button
        id={buttonId}
        type="button"
        className="flex w-full min-h-13 items-center gap-3.5 border-0 px-4.5 py-3 text-(--text) bg-transparent text-[0.92rem] font-semibold text-left cursor-pointer transition-colors duration-140 hover:bg-(--hover) max-[640px]:p-[10px_14px] max-[640px]:text-[0.88rem]"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <span
          className="inline-flex w-6.5 h-6.5 shrink-0 items-center justify-center rounded-md bg-(--accent) text-(--on-accent,#ffffff) text-[0.82rem] font-bold"
          aria-hidden="true"
        >
          {index + 1}
        </span>
        <span className="flex-1 min-w-0 text-(--text)">{section.title}</span>
        <span className="shrink-0 text-(--muted) text-[0.82rem] font-normal mr-1">
          {lessonCount} Lesson{lessonCount === 1 ? "" : "s"}
          {durationLabel ? ` • ${durationLabel}` : ""}
        </span>
        <span
          className={`shrink-0 text-(--muted) inline-flex items-center justify-center transition-transform duration-200 ease-out motion-reduce:transition-none ${
            isOpen ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        >
          <CaretDown size={16} weight="bold" />
        </span>
      </button>

      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        aria-hidden={!isOpen}
        className={`grid motion-reduce:transition-none ${
          isOpen
            ? "grid-rows-[1fr] opacity-100 visible transition-[grid-template-rows,opacity,visibility] duration-300 ease-in-out"
            : "grid-rows-[0fr] opacity-0 invisible transition-[grid-template-rows,opacity,visibility] duration-250 ease-[cubic-bezier(0,1,0,1)]"
        }`}
      >
        <div className="overflow-hidden min-h-0">
          <div className="border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--surface)_95%,var(--text))]">
            {section.lessons.length > 0 ? (
              section.lessons.map(
                ([number, title, duration, status, isPreview, contentType]) => {
                  const isDoc = contentType === "document";
                  return (
                    <div
                      className="group/lesson flex items-center gap-3 min-h-11.5 px-4.5 py-1.5 text-(--text-secondary) text-[0.85rem] cursor-pointer transition-colors duration-140 hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-(--text)"
                      key={number}
                    >
                      {/* Content type icon */}
                      <span
                        className="inline-flex w-5 shrink-0 items-center justify-center text-(--muted) transition-colors duration-140 group-hover/lesson:text-(--accent)"
                        aria-hidden="true"
                      >
                        {isDoc ? (
                          <FileText size={16} weight="regular" />
                        ) : (
                          <PlayCircle size={16} weight="regular" />
                        )}
                      </span>

                      {/* Lesson title */}
                      <span className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[0.85rem] text-(--text-secondary)">
                        {title}
                      </span>

                      {/* Duration */}
                      {duration ? (
                        <span className="text-(--muted) text-[0.78rem] shrink-0 w-11.25 text-right">
                          {duration}
                        </span>
                      ) : null}

                      {/* Free preview badge */}
                      {isPreview && (
                        <span
                          className="shrink-0 inline-flex items-center rounded-[5px] px-[6px] py-[2px] text-[0.7rem] font-[700] leading-none bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-(--accent) border border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
                          aria-label="Free preview"
                        >
                          Free
                        </span>
                      )}

                      {/* Progress status */}
                      {status === "done" ? (
                        <span
                          className="inline-flex items-center justify-center shrink-0"
                          aria-hidden="true"
                        >
                          <CheckCircle
                            size={16}
                            weight="fill"
                            className="text-[#10b981]"
                          />
                        </span>
                      ) : status === "todo" ? (
                        <span
                          className="inline-flex items-center justify-center shrink-0"
                          aria-hidden="true"
                        >
                          <Circle size={16} className="text-(--muted)" />
                        </span>
                      ) : null}
                    </div>
                  );
                },
              )
            ) : (
              <div className="px-3.5 py-3 text-(--muted) text-[0.82rem] italic">
                No lessons added yet
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Header & Hero Section ──────────────────────────────────────────────────

interface CourseHeroSectionProps {
  course: Course;
  title: string;
  thumbnail: string;
  wishlisted: boolean;
  instructorName?: string;
  shortDescription?: string;
  categoryName?: string;
  language?: string;
  pricing?: CourseOverviewPricingProps;
  inclusions?: string[];
  trailerMediaId?: string | null;
  onNavigateCourses?: () => void;
  onToggleWishlist?: (event: MouseEvent<HTMLButtonElement>) => void;
  onNavigatePage?: NavigateTo;
  isReadOnlyPreview?: boolean;
  isCreator?: boolean;
}

function CourseHeroSection({
  course,
  title,
  thumbnail,
  trailerMediaId,
  wishlisted,
  instructorName,
  shortDescription,
  categoryName,
  language,
  pricing,
  inclusions,
  onNavigateCourses,
  onToggleWishlist,
  onNavigatePage,
  isReadOnlyPreview = false,
  isCreator = false,
}: CourseHeroSectionProps) {
  const user = useAuthStore((state) => state.user);
  const preview = useCheckoutPreview();
  const createOrder = useCreateCheckoutOrder();
  const verify = useVerifyPayment();

  const [isPaymentBusy, setIsPaymentBusy] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const [couponInputOpen, setCouponInputOpen] = useState(false);
  const [couponCodeInput, setCouponCodeInput] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    discountAmount: number;
    totalAmount: number;
    currency: string;
    discountLabel?: string;
  } | null>(null);

  const basePrice = pricing?.price ?? "Free";
  const displayPrice = appliedCoupon
    ? appliedCoupon.totalAmount === 0
      ? "Free"
      : formatPriceWithCurrency(appliedCoupon.totalAmount, appliedCoupon.currency)
    : basePrice;
  const originalPrice = pricing?.originalPrice;
  const discount = pricing?.discount;
  const displayDiscount = appliedCoupon
    ? appliedCoupon.discountLabel ||
      `${formatPriceWithCurrency(appliedCoupon.discountAmount, appliedCoupon.currency)} OFF`
    : discount;
  const perksList = inclusions ?? [
    "Full lifetime access",
    "Access on mobile & desktop",
    "Certificate of completion",
  ];
  const priceSizeVariant = getPriceSizeVariant(displayPrice);

  const isPreview = Boolean(isReadOnlyPreview);
  const isCreatorNormal = Boolean(isCreator && !isPreview);
  const isFree =
    !pricing?.price ||
    pricing.price.trim().toLowerCase() === "free" ||
    pricing.price.trim() === "0" ||
    pricing.price.trim() === "$0" ||
    pricing.price.trim() === "₹0";

  const handleApplyCoupon = async () => {
    const code = couponCodeInput.trim().toUpperCase();
    if (!code) return;
    setCouponBusy(true);
    setCouponError(null);

    try {
      const item = { itemType: "course" as const, courseId: course.id };
      const res = await preview.mutateAsync({
        items: [item],
        couponCode: code,
      });

      if (res.couponValidation && !res.couponValidation.valid) {
        setCouponError(res.couponValidation.message || "Invalid coupon code.");
        setCouponBusy(false);
        return;
      }

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

      setAppliedCoupon({
        code,
        discountAmount,
        totalAmount,
        currency,
        discountLabel,
      });

      setCouponInputOpen(false);
      setCouponCodeInput("");
    } catch (err) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Invalid coupon code. Please retry.";
      setCouponError(msg);
    } finally {
      setCouponBusy(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponError(null);
    setCouponCodeInput("");
  };

  const handlePayNow = async () => {
    if (isReadOnlyPreview) return;
    if (!user) {
      setPaymentError("Please log in before purchasing this course.");
      return;
    }

    setIsPaymentBusy(true);
    setPaymentError(null);

    try {
      const item = { itemType: "course" as const, courseId: course.id };
      const coupon = appliedCoupon?.code?.trim();
      const order = await createOrder.mutateAsync({
        items: [item],
        ...(coupon ? { couponCode: coupon.toUpperCase() } : {}),
        idempotencyKey: crypto.randomUUID(),
      });

      if (!order.gateway) {
        setIsPaymentBusy(false);
        onNavigatePage?.(`/learn/${encodeURIComponent(getCourseRouteKey(course))}`);
        return;
      }

      await loadRazorpay();
      if (!window.Razorpay) {
        throw new Error("Payment checkout is unavailable.");
      }

      const rzp = new window.Razorpay({
        key: order.gateway.keyId,
        amount: order.gateway.amount,
        currency: order.gateway.currency,
        name: "VeoLMS",
        description: course.title,
        order_id: order.gateway.gatewayOrderId,
        prefill: {
          name: user.displayName || user.username,
          email: user.email,
        },
        handler: async (response: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          try {
            await verify.mutateAsync({
              orderId: order.order.id,
              gatewayOrderId: response.razorpay_order_id,
              gatewayPaymentId: response.razorpay_payment_id,
              gatewaySignature: response.razorpay_signature,
            });
            setIsPaymentBusy(false);
            onNavigatePage?.(`/learn/${encodeURIComponent(getCourseRouteKey(course))}`);
          } catch (error) {
            setPaymentError(
              error instanceof Error
                ? error.message
                : "Payment verification failed. Please retry.",
            );
            setIsPaymentBusy(false);
          }
        },
        modal: {
          ondismiss: () => {
            setPaymentError("Payment cancelled. You can retry.");
            setIsPaymentBusy(false);
          },
        },
      });

      rzp.open();
    } catch (error) {
      const msg =
        error && typeof error === "object" && "message" in error
          ? String((error as { message: unknown }).message)
          : "Checkout could not be started. Please retry.";
      setPaymentError(msg);
      setIsPaymentBusy(false);
    }
  };

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

  const showApplyCoupon = !isCreatorNormal && !isFree;

  if (isCreatorNormal) {
    // 1. Creator viewing their course normally:
    // Show only "Continue Learning". Clicking it opens the existing Learning Space.
    // Do not show Pay Now or Apply Coupon.
    ctaLabel = "Continue Learning";
    ctaIcon = (
      <Play size="1.15em" weight="fill" className="shrink-0" aria-hidden="true" />
    );
    ctaDisabled = false;
    ctaOnClick = () => {
      if (onNavigatePage) {
        onNavigatePage(`/learn/${encodeURIComponent(getCourseRouteKey(course))}`);
      }
    };
  } else if (isPreview) {
    // 2. Creator Preview:
    // Paid course: show existing price, "Apply coupon", and "Pay Now" as demo UI.
    // Free course: show "Free" and "Enroll for Free" as demo UI.
    if (isFree) {
      ctaLabel = "Enroll for Free";
      ctaIcon = (
        <BookOpen
          size="1.15em"
          weight="bold"
          className="shrink-0"
          aria-hidden="true"
        />
      );
    } else {
      ctaLabel = "Pay Now";
      ctaIcon = (
        <ShoppingBag
          size="1.15em"
          weight="bold"
          className="shrink-0"
          aria-hidden="true"
        />
      );
    }
    ctaDisabled = false;
    ctaOnClick = undefined; // Preview actions stay non-functional.
  } else {
    // 3. Student / Learner:
    // Free course: show "Free" and "Continue Learning", which opens existing Learning Space.
    // Paid course: show price, "Apply coupon", and "Pay Now" which triggers direct checkout.
    if (isFree) {
      ctaLabel = "Continue Learning";
      ctaIcon = (
        <Play size="1.15em" weight="fill" className="shrink-0" aria-hidden="true" />
      );
      ctaDisabled = false;
      ctaOnClick = () => {
        if (onNavigatePage) {
          onNavigatePage(`/learn/${encodeURIComponent(getCourseRouteKey(course))}`);
        }
      };
    } else {
      ctaLabel = isPaymentBusy ? "Processing…" : "Pay Now";
      ctaIcon = isPaymentBusy ? (
        <CircleNotch size="1.15em" className="animate-spin shrink-0" aria-hidden="true" />
      ) : (
        <ShoppingBag
          size="1.15em"
          weight="bold"
          className="shrink-0"
          aria-hidden="true"
        />
      );
      ctaDisabled = isPaymentBusy;
      ctaOnClick = handlePayNow;
    }
  }

  const handlePreviewClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (isReadOnlyPreview) return;
    if (onNavigatePage) {
      onNavigatePage(`/learn/${encodeURIComponent(getCourseRouteKey(course))}`);
    }
  };

  return (
    <div className="grid grid-cols-1 min-[1200px]:grid-cols-2 gap-8 items-start relative max-[1200px]:flex max-[1200px]:flex-col max-[1200px]:gap-5.5 max-[640px]:gap-4.5">
      {/* Left Column: Title, Metadata, Pricing Section */}
      <div className="flex flex-col min-w-0 w-full gap-4 max-[1200px]:contents">
        {/* Upper Navigation Back Button */}
        {onNavigateCourses && (
          <div className="flex items-center gap-2.5 flex-wrap max-[1200px]:order-0 max-[1200px]:w-full">
            <button
              type="button"
              className="inline-flex items-center justify-center w-9.5 h-9.5 rounded-xl border border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-[color-mix(in_srgb,var(--surface)_90%,#000)] text-(--text) cursor-pointer p-0 shadow-[0_2px_8px_rgba(0,0,0,0.14)] transition-[border-color,background-color,color] duration-160 ease-out hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] hover:bg-(--hover) hover:text-(--text)"
              aria-label="Back to courses"
              onClick={onNavigateCourses}
              title="Back to courses"
            >
              <ArrowLeft size={18} weight="bold" />
            </button>
          </div>
        )}

        {/* Lower Content Group: Title, Meta row, Pricing Card */}
        <div className="flex flex-col min-w-0 w-full gap-3.5 max-[1200px]:contents">
          {/* Title & Metadata Group */}
          <div className="flex flex-col min-w-0 shrink-0 max-[1200px]:order-1 max-[1200px]:w-full gap-2.5">
            {/* 1. Title */}
            <h1 className="m-0 text-(--text) text-[2.15rem] font-extrabold leading-[1.16] tracking-[-0.025em] max-[900px]:text-[1.85rem] max-[640px]:text-[1.65rem]">
              {title}
            </h1>

            {/* 2. Metadata row immediately below title */}
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-(--text-secondary) text-[0.88rem] max-[900px]:gap-x-3 max-[900px]:gap-y-1.5 max-[640px]:text-[0.86rem] max-[640px]:gap-x-2.5 max-[640px]:gap-y-1.25">
              {instructorName && (
                <>
                  <span className="inline-flex items-center gap-1.5 text-(--text) font-[650]">
                    <User size={17} weight="bold" aria-hidden="true" />
                    <span>{instructorName}</span>
                  </span>
                  <span
                    className="text-[color-mix(in_srgb,var(--text)_30%,transparent)] text-[0.8rem]"
                    aria-hidden="true"
                  >
                    •
                  </span>
                </>
              )}
              <span className="inline-flex items-center gap-1.5">
                <Stack size={17} aria-hidden="true" />
                <span>
                  {course.sections} Section{course.sections === 1 ? "" : "s"}
                </span>
              </span>
              <span
                className="text-[color-mix(in_srgb,var(--text)_30%,transparent)] text-[0.8rem]"
                aria-hidden="true"
              >
                •
              </span>
              <span className="inline-flex items-center gap-1.5">
                <BookOpen size={17} aria-hidden="true" />
                <span>
                  {course.lectures} Lesson{course.lectures === 1 ? "" : "s"}
                </span>
              </span>
              {/* Language metadata is temporarily hidden per requirements (retained for future use) */}
              {categoryName ? (
                <>
                  <span
                    className="text-[color-mix(in_srgb,var(--text)_30%,transparent)] text-[0.8rem]"
                    aria-hidden="true"
                  >
                    •
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Tag size={17} aria-hidden="true" />
                    <span>{categoryName}</span>
                  </span>
                </>
              ) : null}
              <span
                className="text-[color-mix(in_srgb,var(--text)_30%,transparent)] text-[0.8rem]"
                aria-hidden="true"
              >
                •
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock size={17} aria-hidden="true" />
                <span>{course.duration || "0h 0m"}</span>
              </span>
            </div>
          </div>

          {/* Full-width Rich Pricing Section in Left Column */}
          <div
            className={`flex flex-col min-h-0 rounded-[14px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface)_95%,transparent)] shadow-(--card-shadow) w-full box-border max-[1200px]:order-3 max-[1200px]:w-full max-[1200px]:mt-0 max-[640px]:p-[16px_14px] max-[640px]:gap-3 p-[18px_20px] gap-3.5`}
            aria-label="Course pricing and enrollment"
          >
            {/* Top Row: Prominent Price + Original Price + Discount (Left) and Favourite Button (Top Right) */}
            {!isCreatorNormal && (
              <div className="flex items-start justify-between gap-3 w-full">
                <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1.5 min-w-0 flex-1">
                  <span
                    className={`text-(--text) font-[850] leading-none whitespace-nowrap ${priceTextClasses[priceSizeVariant]}`}
                  >
                    {isFree ? "Free" : displayPrice}
                  </span>
                  {!isFree && (originalPrice || appliedCoupon) && (
                    <span className="text-(--muted) text-[1.05rem] font-medium line-through whitespace-nowrap">
                      {appliedCoupon ? basePrice : originalPrice}
                    </span>
                  )}
                  {!isFree && displayDiscount && (
                    <span className="inline-flex items-center rounded-md px-2 py-0.75 bg-(--accent-soft,color-mix(in_srgb,var(--accent)_18%,transparent)) text-(--accent-ink,var(--accent)) text-[0.75rem] font-[750] leading-none whitespace-nowrap">
                      {displayDiscount}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  className={`inline-flex items-center justify-center w-9.5 h-9.5 shrink-0 rounded-full border border-[color-mix(in_srgb,var(--text)_16%,transparent)] bg-[color-mix(in_srgb,var(--surface)_80%,transparent)] text-(--muted) cursor-pointer transition-[border-color,color,background-color,transform] duration-160 ease-out hover:border-[color-mix(in_srgb,var(--text)_32%,transparent)] hover:text-(--text) hover:bg-(--hover) hover:scale-[1.06] ${
                    wishlisted
                      ? "border-[#ec4899]! text-[#ec4899]! bg-[rgba(236,72,153,0.14)]!"
                      : ""
                  }`}
                  aria-label={
                    wishlisted ? "Remove from wishlist" : "Add to wishlist"
                  }
                  aria-pressed={wishlisted}
                  disabled={isPreview}
                  onClick={onToggleWishlist}
                  title={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
                >
                  <Heart
                    size={20}
                    weight={wishlisted ? "fill" : "regular"}
                    aria-hidden="true"
                  />
                </button>
              </div>
            )}

            {/* Applied Coupon Badge */}
            {appliedCoupon && (
              <div className="flex items-center justify-between gap-2 w-full px-3 py-2 rounded-[9px] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] border border-[color-mix(in_srgb,var(--accent)_28%,transparent)] text-(--text)">
                <div className="flex items-center gap-2 min-w-0">
                  <Ticket
                    size={16}
                    weight="fill"
                    className="text-(--accent) shrink-0"
                    aria-hidden="true"
                  />
                  <span className="text-xs font-bold uppercase tracking-wider text-(--accent-ink,var(--accent)) truncate">
                    {appliedCoupon.code}
                  </span>
                  <span className="text-xs text-(--muted) whitespace-nowrap">
                    applied {appliedCoupon.discountLabel ? `(${appliedCoupon.discountLabel})` : ""}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveCoupon}
                  className="inline-flex items-center justify-center w-5 h-5 rounded-full text-(--muted) hover:text-rose-500 hover:bg-rose-500/10 cursor-pointer transition-colors"
                  aria-label="Remove coupon"
                  title="Remove coupon"
                >
                  <X size={13} weight="bold" />
                </button>
              </div>
            )}

            {/* Inline Coupon Input Box (shown when user clicks 'Apply coupon') */}
            {showApplyCoupon && couponInputOpen && !appliedCoupon && (
              <div className="flex flex-col gap-1.5 w-full">
                <div className="flex items-center gap-2 w-full min-h-10.5 rounded-[9px] bg-[color-mix(in_srgb,var(--surface-strong)_75%,var(--canvas))] border border-[color-mix(in_srgb,var(--text)_18%,transparent)] focus-within:border-(--accent) focus-within:ring-2 focus-within:ring-[color-mix(in_srgb,var(--accent)_18%,transparent)] p-1.5 pl-3 transition-all">
                  <Ticket
                    size={18}
                    weight="bold"
                    className="text-(--muted) shrink-0"
                    aria-hidden="true"
                  />
                  <input
                    type="text"
                    value={couponCodeInput}
                    onChange={(e) => {
                      setCouponCodeInput(e.target.value.toUpperCase());
                      setCouponError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleApplyCoupon();
                      } else if (e.key === "Escape") {
                        setCouponInputOpen(false);
                        setCouponError(null);
                      }
                    }}
                    placeholder="Enter coupon code"
                    disabled={couponBusy}
                    aria-label="Coupon code"
                    className="w-full bg-transparent border-0 text-(--text) placeholder-(--muted) text-[0.86rem] font-semibold tracking-wider outline-none uppercase"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleApplyCoupon}
                    disabled={couponBusy || !couponCodeInput.trim()}
                    className="inline-flex items-center justify-center px-3.5 py-1.5 rounded-[7px] bg-(--accent) text-(--on-accent,#ffffff) text-[0.82rem] font-[750] cursor-pointer whitespace-nowrap transition-all hover:bg-(--accent-hover,color-mix(in_srgb,var(--accent)_85%,var(--text))) disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                  >
                    {couponBusy ? (
                      <CircleNotch size={14} className="animate-spin" />
                    ) : (
                      "Apply"
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCouponInputOpen(false);
                      setCouponError(null);
                    }}
                    aria-label="Cancel"
                    title="Cancel"
                    className="inline-flex items-center justify-center w-7 h-7 rounded-md text-(--muted) hover:text-(--text) hover:bg-(--hover) cursor-pointer transition-colors shrink-0"
                  >
                    <X size={15} weight="bold" />
                  </button>
                </div>
                {couponError && (
                  <p className="m-0 text-xs text-rose-500 font-semibold px-1">
                    {couponError}
                  </p>
                )}
              </div>
            )}

            {/* Middle Row: Actions (Apply Coupon + Pay Now / Continue Learning / Enroll for Free) */}
            <div className="flex flex-wrap items-center gap-2.5 w-full min-w-0 max-[640px]:gap-2">
              {showApplyCoupon && !couponInputOpen && !appliedCoupon && (
                <button
                  type="button"
                  onClick={() => {
                    setCouponInputOpen(true);
                    setCouponError(null);
                  }}
                  className="inline-flex items-center justify-center gap-1.5 min-h-10.5 border border-dashed border-[color-mix(in_srgb,var(--text)_25%,transparent)] rounded-[9px] px-3.5 sm:px-4 py-2 text-(--text) bg-[color-mix(in_srgb,var(--surface)_60%,transparent)] text-[0.86rem] font-[750] cursor-pointer whitespace-nowrap min-w-0 transition-[border-color,color,background-color,transform] duration-160 ease-out hover:border-(--accent) hover:text-(--accent) hover:bg-(--accent-soft,color-mix(in_srgb,var(--accent)_12%,transparent)) hover:-translate-y-px shrink-0 max-[480px]:flex-1 max-[480px]:min-w-30 max-[640px]:px-3 max-[640px]:text-[0.84rem]"
                >
                  <Ticket
                    size="1.15em"
                    weight="bold"
                    className="shrink-0"
                    aria-hidden="true"
                  />
                  <span className="font-[750] truncate">Apply coupon</span>
                </button>
              )}

              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 flex-1 min-h-10.5 min-w-35 px-4 sm:px-5 py-2.5 border-0 rounded-[9px] text-(--on-accent,#ffffff) bg-(--accent) shadow-[0_4px_14px_var(--accent-shadow,color-mix(in_srgb,var(--accent)_28%,transparent))] text-[0.94rem] font-[800] tracking-[-0.01em] cursor-pointer whitespace-nowrap min-w-0 max-[640px]:text-[0.88rem] disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none disabled:shadow-none"
                disabled={ctaDisabled}
                onClick={ctaOnClick}
              >
                {ctaIcon}
                <span className="font-[800] truncate">{ctaLabel}</span>
              </button>
            </div>

            {/* Payment Error Banner */}
            {paymentError && (
              <div className="flex items-center justify-between gap-2 w-full rounded-lg bg-rose-500/12 border border-rose-500/30 p-2.5 text-xs text-rose-500 font-medium">
                <span>{paymentError}</span>
                <button
                  type="button"
                  onClick={() => setPaymentError(null)}
                  className="text-rose-400 hover:text-rose-600 cursor-pointer p-0.5"
                  aria-label="Dismiss error"
                >
                  <X size={13} weight="bold" />
                </button>
              </div>
            )}

            {/* Bottom Row: Additional Inclusions / Value Perks */}
            {perksList.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] text-(--muted) text-[0.82rem] max-[640px]:text-[0.78rem] max-[640px]:gap-x-3 max-[640px]:gap-y-2">
                {perksList.map((perk, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 font-medium whitespace-nowrap"
                  >
                    <CheckCircle
                      size={15}
                      weight="fill"
                      className="text-emerald-500 dark:text-emerald-400 shrink-0"
                      aria-hidden="true"
                    />
                    <span>{perk}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Column: 16:9 Course Trailer */}
      <div className="flex items-end justify-center w-full min-w-0 min-[1200px]:h-full max-[1200px]:order-2 max-[1200px]:w-full max-[640px]:-mx-3.5 max-[640px]:w-[calc(100%+28px)] max-[640px]:max-w-none">
        <div
          className="group w-full aspect-video overflow-hidden border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--surface)_60%,#000)] shadow-(--card-shadow) relative flex items-center justify-center rounded-[14px] max-[640px]:rounded-none max-[640px]:border-x-0"
          aria-label="Course preview player"
        >
          {thumbnail ? (
            <img
              src={thumbnail}
              alt={`Preview thumbnail for ${title}`}
              className="w-full h-full object-cover opacity-90 transition-[transform,opacity] duration-300 motion-reduce:transition-none group-hover:scale-[1.015] group-hover:opacity-[0.98]"
            />
          ) : (
            <CourseThumbnailPlaceholder />
          )}

          {/* Conditional Trailer Overlay & Watch Trailer Action */}
          {Boolean(trailerMediaId) && (
            <>
              <div className="absolute inset-0 bg-linear-to-b from-black/8 to-black/45 pointer-events-none" />

              {/* Bottom Left Pill Button */}
              <button
                type="button"
                className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 bg-black/65 backdrop-blur-[10px] border border-white/18 text-white text-[0.78rem] font-semibold px-3.25 py-1.5 rounded-full cursor-pointer z-2 transition-[background-color,border-color,transform] duration-160 ease-out hover:bg-black/85 hover:border-white/40 hover:-translate-y-px"
                onClick={handlePreviewClick}
                disabled={isReadOnlyPreview}
                aria-label="Watch trailer"
              >
                <PlayCircle size={15} weight="bold" />
                <span>Watch trailer</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
interface CourseAboutCardProps {
  description?: string;
  isReadOnlyPreview?: boolean;
}

/** Line height × clamp lines = collapsed max-height in px. */
const CLAMP_LINES = 5;
const LINE_HEIGHT_PX = 0.88 * 16 * 1.65; // font-size × line-height ≈ 23.2 px

function CourseAboutCard({ description }: CourseAboutCardProps) {
  const hasDescription = Boolean(description && description.trim());
  const [expanded, setExpanded] = useState(false);
  const [needsClamp, setNeedsClamp] = useState(false);
  const contentRef = (node: HTMLDivElement | null) => {
    if (!node) return;
    const collapsedMax = Math.round(LINE_HEIGHT_PX * CLAMP_LINES);
    setNeedsClamp(node.scrollHeight > collapsedMax + 4);
  };

  const collapsedMaxHeight = `${Math.round(LINE_HEIGHT_PX * CLAMP_LINES)}px`;

  return (
    <section
      className="p-[18px_22px] rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-(--surface) shadow-(--card-shadow) max-[640px]:p-[18px_16px]"
      aria-labelledby="cov-about-heading"
    >
      <h2
        id="cov-about-heading"
        className="m-0 mb-3 text-(--text) text-[1.24rem] font-bold tracking-[-0.015em]"
      >
        About this course
      </h2>

      {hasDescription ? (
        <div className="flex flex-col gap-2">
          {/* Clamp wrapper */}
          <div className="relative">
            <div
              ref={contentRef}
              className="cov-prose text-[0.88rem] leading-[1.65] overflow-hidden transition-[max-height] duration-300 ease-in-out"
              style={{
                maxHeight: needsClamp && !expanded ? collapsedMaxHeight : "9999px",
              }}
            >
              <DiscussionMarkdown
                content={createDiscussionDraft(description!.trim())}
                label="About this course"
                className="[&>:first-child]:mt-0 max-w-none"
              />
            </div>

            {/* Gradient fade — only shown when collapsed and clamp is active */}
            {needsClamp && !expanded && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-(--surface) to-transparent"
              />
            )}
          </div>

          {/* Toggle button */}
          {needsClamp && (
            <button
              type="button"
              data-testid="description-toggle"
              onClick={() => setExpanded((prev) => !prev)}
              className="self-start flex items-center gap-1.5 text-[0.82rem] font-semibold text-(--accent) hover:opacity-80 transition-opacity cursor-pointer bg-transparent border-0 p-0"
            >
              {expanded ? (
                <>
                  Show less
                  <CaretDown
                    size={13}
                    weight="bold"
                    className="rotate-180 transition-transform duration-200"
                  />
                </>
              ) : (
                <>
                  Show more
                  <CaretDown
                    size={13}
                    weight="bold"
                    className="transition-transform duration-200"
                  />
                </>
              )}
            </button>
          )}
        </div>
      ) : (
        <div
          className="p-8 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-(--surface) text-(--muted) text-center text-[0.88rem] italic"
          data-testid="course-description-empty"
        >
          No description available yet
        </div>
      )}
    </section>
  );
}

// ─── course curriculum card ──────────────────────────────────────────────────

interface CourseCurriculumCardProps {
  course: Course;
  courseSections: CourseSection[];
  openSections: Set<number>;
  onToggleSection: (index: number) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}

function CourseCurriculumCard({
  course,
  courseSections,
  openSections,
  onToggleSection,
  onExpandAll,
  onCollapseAll,
}: CourseCurriculumCardProps) {
  const allSectionsExpanded =
    courseSections.length > 0 && openSections.size === courseSections.length;

  return (
    <section
      className="p-[18px_22px] rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-(--surface) shadow-(--card-shadow) max-[640px]:p-[18px_16px]"
      aria-labelledby="cov-curriculum-heading"
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2
            id="cov-curriculum-heading"
            className="m-0 mb-2.5 text-(--text) text-[1.1rem] font-bold tracking-[-0.015em]"
          >
            Course curriculum
          </h2>
          <p className="m-0 mt-0.5 text-(--muted) text-[0.82rem]">
            {course.sections} Section{course.sections === 1 ? "" : "s"} &bull;{" "}
            {course.lectures} Lesson{course.lectures === 1 ? "" : "s"} &bull; {course.duration}
          </p>
        </div>
        <div className="flex items-center shrink-0 pt-1">
          <button
            type="button"
            className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-[color-mix(in_srgb,var(--surface)_92%,var(--text))] text-(--muted) cursor-pointer"
            onClick={allSectionsExpanded ? onCollapseAll : onExpandAll}
            aria-label={
              allSectionsExpanded ? "Collapse all sections" : "Expand all sections"
            }
            title={
              allSectionsExpanded ? "Collapse all sections" : "Expand all sections"
            }
          >
            {allSectionsExpanded ? (
              <ArrowsInLineVertical size={17} weight="bold" aria-hidden="true" />
            ) : (
              <ArrowsOutLineVertical size={17} weight="bold" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {courseSections.length === 0 ? (
        <div className="p-8 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-(--surface) text-(--muted) text-center text-[0.88rem] italic">
          No sections added yet
        </div>
      ) : (
        <div className="flex flex-col gap-1.5" role="list">
          {courseSections.map((section, index) => (
            <CurriculumSectionItem
              key={section.id}
              section={section}
              index={index}
              isOpen={openSections.has(index)}
              onToggle={() => onToggleSection(index)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ─── main page ───────────────────────────────────────────────────────────────

export interface CourseOverviewPageProps {
  courseSlug?: string | undefined;
  onNavigateCourses?: () => void;
  onNavigatePage?: NavigateTo;
  role?: CourseRole;
  isCreator?: boolean;
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
}

export interface AdaptedOverviewData {
  course: Course;
  description: string;
  shortDescription: string | undefined;
  categoryName: string | undefined;
  language: string | undefined;
  sections: CourseSection[];
  inclusions: string[];
  pricing: CourseOverviewPricingProps;
  instructorName: string | undefined;
  trailerMediaId: string | null;
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
  const resolvedDuration = formatDuration(resolvedDurationSeconds);

  const resolvedThumbnail = c.thumbnailMediaId
    ? `/api/v1/media/${c.thumbnailMediaId}`
    : "";

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
    lifecycleStatus: (c.status === "published"
      ? "published"
      : "draft") as CourseLifecycleStatus,
    creatorId: c.creatorId ?? overview.creator?.id ?? null,
  };

  const adaptedSections: CourseSection[] = (overview.sections || [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((sec, secIdx) => ({
      id: secIdx + 1,
      title: sec.title || `Section ${secIdx + 1}`,
      progress: `0/${sec.lessons?.length ?? 0}`,
      lessons: (sec.lessons || [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((les, lesIdx) => [
          lesIdx + 1,
          les.title || `Lesson ${lesIdx + 1}`,
          formatDuration(les.durationSeconds ?? 0),
          "todo" as const,
          les.isPreview,
          les.contentType ?? "video",
        ]),
    }));

  const finalPerks: string[] = Array.isArray(overview.includes)
    ? overview.includes
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((inc) => inc.text.trim())
        .filter(Boolean)
        .slice(0, 6)
    : [];

  let pricingProps: CourseOverviewPricingProps;
  const pr = overview.pricing;
  if (!pr || pr.pricingType === "free") {
    pricingProps = { price: "Free" };
  } else {
    const activeSale = isCourseSaleActive(pr.salePrice, pr.price);

    if (activeSale && pr.salePrice != null) {
      const discountPct = Math.round(
        ((pr.price - pr.salePrice) / pr.price) * 100,
      );
      pricingProps = {
        price: formatPriceWithCurrency(pr.salePrice, pr.currency),
        originalPrice: formatPriceWithCurrency(pr.price, pr.currency),
        discount: `${discountPct}% OFF`,
      };
    } else {
      pricingProps = {
        price: formatPriceWithCurrency(pr.price, pr.currency),
      };
    }
  }

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
    duration: formatDuration(totalDurationSeconds),
    students: 0,
    thumbnail: c.thumbnailMediaId
      ? `/api/v1/media/${c.thumbnailMediaId}`
      : "",
    lifecycleStatus: (c.status === "published"
      ? "published"
      : "draft") as CourseLifecycleStatus,
    creatorId: c.creatorId ?? null,
  };

  const adaptedSections: CourseSection[] = (previewData.sections || [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((sec, secIdx) => ({
      id: secIdx + 1,
      title: sec.title || `Section ${secIdx + 1}`,
      progress: `0/${sec.lessons?.length ?? 0}`,
      lessons: (sec.lessons || [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((les, lesIdx) => [
          lesIdx + 1,
          les.title || `Lesson ${lesIdx + 1}`,
          formatDuration(les.durationSeconds ?? 0),
          "todo" as const,
          les.isPreview,
          les.contentType ?? "video",
        ]),
    }));

  const finalPerks: string[] = Array.isArray(previewData.includes)
    ? previewData.includes
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((inc) => inc.text.trim())
        .filter(Boolean)
        .slice(0, 6)
    : [];

  let pricingProps: CourseOverviewPricingProps;
  const pr = previewData.pricing;
  if (!pr || pr.pricingType === "free") {
    pricingProps = { price: "Free" };
  } else {
    const activeSale = isCourseSaleActive(pr.salePrice, pr.price);

    if (activeSale && pr.salePrice != null) {
      const discountPct = Math.round(
        ((pr.price - pr.salePrice) / pr.price) * 100,
      );
      pricingProps = {
        price: formatPriceWithCurrency(pr.salePrice, pr.currency),
        originalPrice: formatPriceWithCurrency(pr.price, pr.currency),
        discount: `${discountPct}% OFF`,
      };
    } else {
      pricingProps = {
        price: formatPriceWithCurrency(pr.price, pr.currency),
      };
    }
  }

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

export function CourseOverviewSkeleton({
  onNavigateCourses,
}: {
  onNavigateCourses?: () => void;
}) {
  return (
    <div
      className="w-full max-w-275 mx-auto flex flex-col gap-6 max-[900px]:gap-4.5 max-[640px]:gap-4 box-border text-(--text) animate-pulse"
      data-testid="course-overview-skeleton"
    >
      <div className="grid grid-cols-1 min-[1200px]:grid-cols-2 gap-8 items-start relative max-[1200px]:flex max-[1200px]:flex-col max-[1200px]:gap-5.5 max-[640px]:gap-4.5 w-full">
        {/* Left Column Skeleton */}
        <div className="flex flex-col min-w-0 w-full gap-4 max-[1200px]:contents">
          {/* Top Back button skeleton */}
          {onNavigateCourses && (
            <div className="flex items-center gap-2.5 flex-wrap max-[1200px]:order-0 max-[1200px]:w-full">
              <div className="w-9.5 h-9.5 rounded-xl bg-[color-mix(in_srgb,var(--text)_10%,transparent)]" />
            </div>
          )}

          <div className="flex flex-col min-w-0 w-full gap-3.5 max-[1200px]:contents">
            {/* Title & Metadata row skeleton */}
            <div className="flex flex-col min-w-0 shrink-0 max-[1200px]:order-1 max-[1200px]:w-full gap-2.5">
              <div className="flex flex-col gap-2">
                <div className="h-9 w-11/12 rounded-lg bg-[color-mix(in_srgb,var(--text)_12%,transparent)]" />
                <div className="h-9 w-3/5 rounded-lg bg-[color-mix(in_srgb,var(--text)_12%,transparent)]" />
              </div>

              <div className="flex items-center gap-3 py-1">
                <div className="h-5 w-28 rounded-md bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                <div className="h-5 w-24 rounded-md bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                <div className="h-5 w-20 rounded-md bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
              </div>
            </div>

            {/* Pricing Box skeleton */}
            <div className="flex flex-col min-h-0 rounded-[14px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface)_95%,transparent)] shadow-(--card-shadow) w-full box-border max-[1200px]:order-3 max-[1200px]:w-full max-[1200px]:mt-0 max-[640px]:p-[16px_14px] max-[640px]:gap-3 p-[18px_20px] gap-3.5">
              <div className="flex items-baseline gap-3 mb-2">
                <div className="h-9 w-32 rounded-lg bg-[color-mix(in_srgb,var(--text)_14%,transparent)]" />
                <div className="h-6 w-20 rounded-md bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
              </div>
              <div className="h-11 w-full rounded-xl bg-[color-mix(in_srgb,var(--accent)_30%,transparent)] mb-2" />
              <div className="flex flex-col gap-2.5 pt-3 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                <div className="h-4 w-48 rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                <div className="h-4 w-40 rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
                <div className="h-4 w-52 rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: 16:9 Course Trailer Video Placeholder */}
        <div className="flex items-end justify-center w-full min-w-0 min-[1200px]:h-full max-[1200px]:order-2 max-[1200px]:w-full max-[640px]:-mx-3.5 max-[640px]:w-[calc(100%+28px)] max-[640px]:max-w-none">
          <div className="w-full aspect-video overflow-hidden border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--surface)_60%,#000)] shadow-(--card-shadow) relative flex items-center justify-center rounded-[14px] max-[640px]:rounded-none max-[640px]:border-x-0" />
        </div>
      </div>

      {/* Lower section: Description & Curriculum skeletons */}
      <div className="mt-6 max-[640px]:mt-2 flex flex-col gap-6 max-[640px]:gap-4 w-full">
        <div className="rounded-[14px] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-(--surface) p-6 max-[640px]:p-4 shadow-(--card-shadow) flex flex-col gap-3">
          <div className="h-7 w-48 rounded-lg bg-[color-mix(in_srgb,var(--text)_12%,transparent)] mb-1" />
          <div className="h-4 w-full rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
          <div className="h-4 w-5/6 rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
          <div className="h-4 w-4/6 rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
        </div>

        <div className="rounded-[14px] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-(--surface) p-6 max-[640px]:p-4 shadow-(--card-shadow) flex flex-col gap-4">
          <div className="h-7 w-56 rounded-lg bg-[color-mix(in_srgb,var(--text)_12%,transparent)] mb-1" />
          <div className="h-14 w-full rounded-xl border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))]" />
        </div>
      </div>
    </div>
  );
}

export function CourseOverviewPage(props: CourseOverviewPageProps) {
  const { courseSlug: routeCourseSlug } = useParams();
  const courseSlug = props.courseSlug ?? routeCourseSlug;
  const serverCategories = props.categories ?? [];
  const authUser = useAuthStore((s) => s.user);
  const defaultInstructorName =
    authUser?.displayName || authUser?.username || "Instructor";

  const { data: apiOverview, isLoading: isOverviewLoading } = useCourseOverview(
    courseSlug,
    {
      enabled: !props.previewData && !props.customCourse && Boolean(courseSlug),
    },
  );

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

  if (
    isOverviewLoading &&
    !course &&
    !props.previewData &&
    !props.customCourse
  ) {
    return (
      <CourseOverviewSkeleton onNavigateCourses={props.onNavigateCourses} />
    );
  }

  if (!course) {
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
    <CourseOverviewContent
      {...props}
      key={course.id}
      course={course}
      courseSlug={courseSlug}
      defaultInstructorName={defaultInstructorName}
      adaptedFromPreview={activeAdapted}
      isCreator={isCreator}
    />
  );
}

type CourseOverviewContentProps = CourseOverviewPageProps & {
  course: Course;
  courseSlug: string | undefined;
  defaultInstructorName: string;
  adaptedFromPreview: AdaptedOverviewData | null;
  isCreator?: boolean;
};

function CourseOverviewContent({
  course,
  courseSlug,
  defaultInstructorName,
  adaptedFromPreview,
  onNavigateCourses,
  onNavigatePage,
  customCourse,
  customInstructor,
  customDescription,
  customShortDescription,
  customCategoryName,
  customLanguage,
  customSections,
  customIncludes,
  customInclusions,
  customPricing,
  customTrailerMediaId,
  isReadOnlyPreview = false,
  isCreator = false,
}: CourseOverviewContentProps) {
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
  const categoryName =
    adaptedFromPreview !== null
      ? adaptedFromPreview?.categoryName
      : (customCategoryName ??
        (!isReadOnlyPreview && course.category ? course.category : undefined));
  const instructorName =
    adaptedFromPreview !== null
      ? adaptedFromPreview?.instructorName
      : customInstructor !== undefined
        ? customInstructor
        : defaultInstructorName;
  const language = adaptedFromPreview?.language ?? customLanguage ?? undefined;
  const courseSections = adaptedFromPreview?.sections ?? customSections ?? [];
  const activeDescription =
    adaptedFromPreview?.description ?? customDescription ?? course.description;
  const activePricing = adaptedFromPreview?.pricing ?? customPricing;

  const inclusions: string[] | undefined = adaptedFromPreview
    ? adaptedFromPreview.inclusions
    : customInclusions !== undefined
      ? Array.from(
          new Set(customInclusions.map((s) => s.trim()).filter(Boolean)),
        )
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
          )
        : undefined;

  const [openSections, setOpenSections] = useState<Set<number>>(
    () => new Set([0]),
  );
  const [wishlisted, setWishlisted] = useState(() => {
    try {
      const saved: unknown = JSON.parse(
        localStorage.getItem("veolms-wishlist") || "[]",
      );
      return Array.isArray(saved) && saved.includes(course.id);
    } catch {
      return false;
    }
  });

  const toggleSection = (index: number) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const expandAllSections = () => {
    setOpenSections(new Set(courseSections.map((_, index) => index)));
  };

  const collapseAllSections = () => {
    setOpenSections(new Set());
  };

  const toggleWishlist = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (isReadOnlyPreview) return;
    setWishlisted((prev) => {
      const next = !prev;
      try {
        const saved: unknown = JSON.parse(
          localStorage.getItem("veolms-wishlist") || "[]",
        );
        const list = Array.isArray(saved) ? (saved as string[]) : [];
        const updated = next
          ? [...list, course.id]
          : list.filter((id) => id !== course.id);
        localStorage.setItem("veolms-wishlist", JSON.stringify(updated));
      } catch {
        // best effort
      }
      return next;
    });
  };

  const trailerMediaId =
    adaptedFromPreview?.trailerMediaId ??
    customTrailerMediaId ??
    (course as { trailerMediaId?: string | null }).trailerMediaId ??
    null;

  return (
    <div
      data-course-overview
      className={`w-full max-w-275 mx-auto flex flex-col gap-6 box-border text-(--text) ${
        isReadOnlyPreview
          ? "p-[36px_24px_48px] max-[900px]:p-[24px_16px_48px] max-[900px]:gap-4.5 max-[640px]:p-[16px_14px_40px] max-[640px]:gap-4"
          : "max-[900px]:gap-4.5 max-[640px]:gap-4"
      }`}
    >
      {/* 1. Two-Column Hero Section with Info & Pricing on Left, Trailer on Right */}
      <CourseHeroSection
        course={course}
        title={title}
        thumbnail={thumbnail}
        trailerMediaId={trailerMediaId}
        wishlisted={wishlisted}
        instructorName={instructorName}
        shortDescription={shortDescription}
        categoryName={categoryName}
        language={language}
        pricing={activePricing}
        inclusions={inclusions}
        onNavigateCourses={onNavigateCourses}
        onToggleWishlist={toggleWishlist}
        onNavigatePage={onNavigatePage}
        isReadOnlyPreview={isReadOnlyPreview}
        isCreator={isCreator}
      />

      {/* 2. About This Course */}
      <CourseAboutCard description={activeDescription} />

      {/* 3. Course Curriculum */}
      <CourseCurriculumCard
        course={course}
        courseSections={courseSections}
        openSections={openSections}
        onToggleSection={toggleSection}
        onExpandAll={expandAllSections}
        onCollapseAll={collapseAllSections}
      />
    </div>
  );
}
