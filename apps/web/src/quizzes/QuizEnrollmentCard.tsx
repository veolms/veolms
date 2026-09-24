import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { CurrencyInr } from "@phosphor-icons/react/CurrencyInr";
import { Exam } from "@phosphor-icons/react/Exam";
import { Lock } from "@phosphor-icons/react/Lock";
import { Tag } from "@phosphor-icons/react/Tag";
import { Button } from "../components/Button";
import { useCurrentUser } from "../services/auth";
import {
  useCreateCheckoutOrder,
  useVerifyPayment,
} from "../services/payments/payment.mutations";
import { quizKeys } from "../services/quizzes/quizzes.keys";
import { useQuizPricingPreview } from "../services/quizzes/quizzes.queries";

async function loadRazorpay(): Promise<void> {
  if (typeof window === "undefined") return;
  if (window.Razorpay) return;
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load payment gateway SDK"));
    document.body.appendChild(script);
  });
}

export interface QuizEnrollmentCardProps {
  courseId: string;
  assignmentId: string;
  quizTitle?: string;
  lessonBadge?: string;
  onEnrolled: () => void;
  onBackToVideo?: () => void;
}

export function QuizEnrollmentCard({
  courseId,
  assignmentId,
  quizTitle,
  lessonBadge,
  onEnrolled,
  onBackToVideo,
}: QuizEnrollmentCardProps) {
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const pricingPreviewQuery = useQuizPricingPreview(courseId, assignmentId);
  const createOrder = useCreateCheckoutOrder();
  const verify = useVerifyPayment();

  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const preview = pricingPreviewQuery.data;

  // A student who already holds access (or a free quiz) never needs this card.
  // Notify the parent once, from an effect rather than during render.
  const hasAccess = preview?.isEnrolled ?? false;
  const notifiedEnrolledRef = useRef(false);
  useEffect(() => {
    if (hasAccess && !notifiedEnrolledRef.current) {
      notifiedEnrolledRef.current = true;
      onEnrolled();
    }
  }, [hasAccess, onEnrolled]);

  const formatPrice = (amount: number, currency: string = "INR") => {
    try {
      return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(amount);
    } catch {
      return `${currency} ${amount}`;
    }
  };

  if (pricingPreviewQuery.isLoading) {
    return (
      <section
        className="mx-auto max-w-2xl rounded-[16px] sm:rounded-[24px] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-(--card-surface,var(--surface)) p-5 sm:p-8 text-(--text)"
        style={{ boxShadow: "var(--card-shadow)" }}
      >
        <div className="flex items-center justify-center py-12">
          <CircleNotch size={24} className="animate-spin text-(--accent)" />
          <span className="ml-2 text-sm text-(--muted)">Loading quiz access details...</span>
        </div>
      </section>
    );
  }

  if (pricingPreviewQuery.isError || !preview) {
    return (
      <section
        className="mx-auto max-w-2xl rounded-[16px] sm:rounded-[24px] border border-red-500/20 bg-(--card-surface,var(--surface)) p-5 sm:p-8 text-(--text)"
        style={{ boxShadow: "var(--card-shadow)" }}
      >
        {onBackToVideo ? (
          <button
            type="button"
            onClick={onBackToVideo}
            className="mb-4 inline-flex items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_70%,var(--surface))] px-2.5 py-1 text-xs font-medium text-(--muted) hover:text-(--text) hover:border-(--accent) transition-all cursor-pointer active:scale-95 shadow-(--card-compact-shadow)"
          >
            <ArrowLeft size={13} weight="bold" />
            <span>Back to video</span>
          </button>
        ) : null}
        <p className="text-sm text-red-400">
          Unable to check quiz access. {pricingPreviewQuery.error?.message ?? "Please try again."}
        </p>
        <Button
          onClick={() => void pricingPreviewQuery.refetch()}
          className="mt-4 h-9 px-4 text-xs font-semibold"
        >
          Try again
        </Button>
      </section>
    );
  }

  const { pricingType, currency, catalogPrice, salePrice } = preview;

  if (hasAccess) return null;

  const activePrice =
    salePrice !== null && salePrice !== undefined && salePrice < catalogPrice
      ? salePrice
      : catalogPrice;

  const isFree = pricingType === "free";

  const handleEnrollment = async () => {
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      // The card only appears for a paid quiz the student has not bought yet.
      // The server prices the order from the configured quiz price.
      if (!preview.quizPricingId) {
        throw new Error("This quiz is not available for purchase.");
      }

      const order = await createOrder.mutateAsync({
        items: [
          {
            itemType: "quiz",
            quizPricingId: preview.quizPricingId,
          },
        ],
        idempotencyKey: crypto.randomUUID(),
      });

      if (!order.gateway) {
        await queryClient.invalidateQueries({ queryKey: quizKeys.all });
        await pricingPreviewQuery.refetch();
        setIsProcessing(false);
        onEnrolled();
        return;
      }

      await loadRazorpay();
      if (!window.Razorpay) {
        throw new Error("Payment gateway is unavailable. Please try again.");
      }

      const rzp = new window.Razorpay({
        key: order.gateway.keyId,
        amount: order.gateway.amount,
        currency: order.gateway.currency,
        name: "VeoLMS",
        description: `Quiz Access - ${quizTitle || "Assessment"}`,
        order_id: order.gateway.gatewayOrderId,
        prefill: {
          name: user?.displayName || user?.username || "",
          email: user?.email || "",
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
            await queryClient.invalidateQueries({ queryKey: quizKeys.all });
            await pricingPreviewQuery.refetch();
            setIsProcessing(false);
            onEnrolled();
          } catch (err: unknown) {
            setIsProcessing(false);
            setErrorMessage(
              err instanceof Error
                ? err.message
                : "Payment verification failed. Please contact support.",
            );
          }
        },
        modal: {
          ondismiss: () => {
            setIsProcessing(false);
          },
        },
      });

      rzp.open();
    } catch (err: unknown) {
      setIsProcessing(false);
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to initiate quiz enrollment.",
      );
    }
  };

  return (
    <section
      data-quiz-surface=""
      className="mx-auto max-w-2xl rounded-[16px] sm:rounded-[24px] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-(--card-surface,var(--surface)) p-4 sm:p-8 text-(--text)"
      style={{ boxShadow: "var(--card-shadow)" }}
    >
      {onBackToVideo || lessonBadge ? (
        <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
          {onBackToVideo ? (
            <button
              type="button"
              onClick={onBackToVideo}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_70%,var(--surface))] px-2.5 py-1 text-xs font-medium text-(--muted) hover:text-(--text) hover:border-(--accent) transition-all cursor-pointer active:scale-95 shadow-(--card-compact-shadow)"
            >
              <ArrowLeft size={13} weight="bold" />
              <span>Back to video</span>
            </button>
          ) : (
            <span />
          )}
          {lessonBadge ? (
            <div className="flex items-center gap-1.5 text-xs font-medium text-(--muted)">
              <Exam size={14} className="text-(--accent)" weight="bold" />
              <span>{lessonBadge}</span>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center gap-2 mb-2">
        <div className="flex size-8 items-center justify-center rounded-lg bg-(--accent)/10 text-(--accent)">
          {isFree ? <CheckCircle size={18} weight="bold" /> : <Lock size={18} weight="bold" />}
        </div>
        <div>
          <p className="text-[0.65rem] sm:text-[0.7rem] font-bold uppercase tracking-[0.14em] text-(--accent)">
            {isFree ? "Quiz Access" : "Paid Assessment"}
          </p>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-(--text)">
            {quizTitle || "Lesson Assessment"}
          </h1>
        </div>
      </div>

      <p className="text-xs sm:text-sm text-(--muted) mt-1 leading-relaxed">
        {pricingType === "free"
          ? "This quiz is included with your course enrollment. Click below to start your attempt."
          : "This is a premium assessment designed to test and certify your mastery of the concepts covered in this lesson."}
      </p>

      {pricingType === "paid" ? (
        <div className="mt-5 space-y-4">
          {/* Pricing Breakdown Card */}
          <div className="rounded-xl border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface-raised,var(--surface-strong)) p-3.5 sm:p-4.5 space-y-2.5">
            <div className="flex items-center justify-between text-xs sm:text-sm text-(--muted)">
              <span>Catalog Price</span>
              <span className={salePrice !== null && salePrice < catalogPrice ? "line-through opacity-70" : "font-medium text-(--text)"}>
                {formatPrice(catalogPrice, currency)}
              </span>
            </div>

            {salePrice !== null && salePrice < catalogPrice ? (
              <div className="flex items-center justify-between text-xs sm:text-sm text-emerald-400">
                <span className="flex items-center gap-1">
                  <Tag size={13} weight="bold" />
                  <span>Special Sale Price</span>
                </span>
                <span className="font-semibold">{formatPrice(salePrice, currency)}</span>
              </div>
            ) : null}

            <div className="border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] pt-2.5 flex items-center justify-between">
              <span className="text-xs sm:text-sm font-bold text-(--text)">Total Payable</span>
              <span className="text-base sm:text-xl font-bold text-(--text)">
                {formatPrice(activePrice, currency)}
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mt-4 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs sm:text-sm text-red-400">
          {errorMessage}
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button
          onClick={handleEnrollment}
          disabled={isProcessing}
          className="h-10 px-5 font-semibold text-xs sm:text-sm"
        >
          {isProcessing ? (
            <>
              <CircleNotch size={15} className="animate-spin mr-2" />
              <span>Processing...</span>
            </>
          ) : isFree ? (
            "Start Quiz"
          ) : (
            `Pay ${formatPrice(activePrice, currency)} & Unlock Quiz`
          )}
        </Button>

        {onBackToVideo ? (
          <Button
            motion="static"
            className="h-10 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-(--card-surface-raised,var(--surface-strong)) px-4 text-xs sm:text-sm text-(--text) shadow-none hover:bg-(--hover)"
            onClick={onBackToVideo}
          >
            Back to video
          </Button>
        ) : null}
      </div>
    </section>
  );
}
