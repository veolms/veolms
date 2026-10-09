import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { CurrencyInr } from "@phosphor-icons/react/CurrencyInr";
import { Lock } from "@phosphor-icons/react/Lock";
import { Tag } from "@phosphor-icons/react/Tag";
import { Button } from "../components/Button";
import { LoadingSpinnerIcon } from "../components/LoadingSpinner";
import { productName } from "../routing/routeDescriptors";
import { useCurrentUser } from "../services/auth";
import {
  useCreateCheckoutOrder,
  useVerifyPayment,
} from "../services/payments/payment.mutations";
import { quizKeys } from "../services/quizzes/quizzes.keys";
import { useQuizPricingPreview } from "../services/quizzes/quizzes.queries";
import {
  QUIZ_EYEBROW,
  QUIZ_HAIRLINE,
  QUIZ_PRIMARY_ACTION,
  QUIZ_RAISED_SURFACE,
  QUIZ_SECONDARY_ACTION,
  QuizNotice,
  QuizStage,
  QuizStageBar,
  QuizStageBody,
} from "./attempt/QuizStage";
import { QuizStageMessage } from "./attempt/QuizStageMessage";

async function loadRazorpay(): Promise<void> {
  if (typeof window === "undefined") return;
  if (window.Razorpay) return;
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(
      'script[src="https://checkout.razorpay.com/v1/checkout.js"]',
    );
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Failed to load payment gateway SDK"));
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
  const checkoutIntentRef = useRef<{ intent: string; key: string } | null>(
    null,
  );
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
      <QuizStageMessage
        lessonBadge={lessonBadge}
        onBackToVideo={onBackToVideo}
        role="status"
        label="Loading quiz access details"
        visual={
          <span className="text-(--muted)">
            <LoadingSpinnerIcon size={26} />
          </span>
        }
      />
    );
  }

  if (pricingPreviewQuery.isError || !preview) {
    return (
      <QuizStageMessage
        lessonBadge={lessonBadge}
        onBackToVideo={onBackToVideo}
        role="alert"
        title="Unable to check quiz access"
        actions={
          <Button
            motion="static"
            onClick={() => void pricingPreviewQuery.refetch()}
            className={QUIZ_SECONDARY_ACTION}
          >
            Try again
          </Button>
        }
      >
        {pricingPreviewQuery.error?.message ?? "Please try again."}
      </QuizStageMessage>
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

      // The key identifies this purchase, not this click: a second click on
      // the same quiz must reach the same order. A new key per click made
      // the server see every retry as a new purchase.
      const intent = preview.quizPricingId;
      if (checkoutIntentRef.current?.intent !== intent) {
        checkoutIntentRef.current = { intent, key: crypto.randomUUID() };
      }
      const order = await createOrder.mutateAsync({
        items: [
          {
            itemType: "quiz",
            quizPricingId: preview.quizPricingId,
          },
        ],
        idempotencyKey: checkoutIntentRef.current.key,
      });

      // No payment step (nothing to pay), or the same purchase was already
      // paid on an earlier attempt whose confirmation did not reach this
      // page: access is granted, and reopening the gateway would only show
      // an error for an order that is complete.
      if (!order.gateway || order.order.status === "paid") {
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
        name: productName,
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
        err instanceof Error
          ? err.message
          : "Failed to initiate quiz enrollment.",
      );
    }
  };

  const onSale = salePrice !== null && salePrice < catalogPrice;

  return (
    <QuizStage label="Quiz access">
      <QuizStageBar onBackToVideo={onBackToVideo} context={lessonBadge} />
      <QuizStageBody width="narrow" className="pt-4 pb-6 sm:pt-7 sm:pb-9">
        <div className="flex items-start gap-3.5">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-(--accent-ink,var(--accent))">
            {isFree ? (
              <CheckCircle size={22} weight="duotone" aria-hidden="true" />
            ) : (
              <Lock size={22} weight="duotone" aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0">
            <p className={QUIZ_EYEBROW}>
              {isFree ? "Quiz access" : "Paid assessment"}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight wrap-break-word text-(--text) sm:text-[1.75rem]">
              {quizTitle || "Lesson assessment"}
            </h1>
          </div>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-(--text-secondary)">
          {pricingType === "free"
            ? "This quiz is included with your course enrollment. Start whenever you are ready."
            : "This is a premium assessment that tests and certifies your grasp of what this lesson covers."}
        </p>

        {pricingType === "paid" ? (
          <dl
            className={`mt-5 grid gap-2.5 rounded-[14px] p-4 text-sm ${QUIZ_RAISED_SURFACE}`}
          >
            <div className="flex items-center justify-between gap-3 text-(--text-secondary)">
              <dt>Catalog price</dt>
              <dd
                className={
                  onSale
                    ? "line-through opacity-70"
                    : "font-semibold text-(--text)"
                }
              >
                {formatPrice(catalogPrice, currency)}
              </dd>
            </div>

            {onSale ? (
              <div className="flex items-center justify-between gap-3 text-(--quiz-positive)">
                <dt className="flex items-center gap-1.5">
                  <Tag size={14} weight="bold" aria-hidden="true" />
                  <span>Sale price</span>
                </dt>
                <dd className="font-semibold">
                  {formatPrice(salePrice, currency)}
                </dd>
              </div>
            ) : null}

            <div
              className={`flex items-center justify-between gap-3 border-t pt-2.5 ${QUIZ_HAIRLINE}`}
            >
              <dt className="font-bold text-(--text)">Total payable</dt>
              <dd className="text-xl font-bold text-(--text) tabular-nums">
                {formatPrice(activePrice, currency)}
              </dd>
            </div>
          </dl>
        ) : null}

        {errorMessage ? (
          <div className="mt-4">
            <QuizNotice tone="negative" role="alert">
              {errorMessage}
            </QuizNotice>
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
          <Button
            onClick={handleEnrollment}
            disabled={isProcessing}
            className={QUIZ_PRIMARY_ACTION}
          >
            {isProcessing ? (
              <>
                <CircleNotch size={16} className="animate-spin" />
                <span>Processing…</span>
              </>
            ) : isFree ? (
              "Start quiz"
            ) : (
              `Pay ${formatPrice(activePrice, currency)} & unlock quiz`
            )}
          </Button>
        </div>
      </QuizStageBody>
    </QuizStage>
  );
}
