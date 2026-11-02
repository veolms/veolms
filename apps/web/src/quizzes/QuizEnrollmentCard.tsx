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
import { readCheckoutStartError } from "../services/payments/checkoutError";
import { openGatewayCheckout } from "../services/payments/gateways/gatewayCheckout";
import {
  useAwaitPaidOrder,
  useCreateCheckoutOrder,
  useReleaseCheckoutOrder,
  useVerifyPayment,
} from "../services/payments/payment.mutations";
import {
  PAYMENT_BEING_CONFIRMED_MESSAGE,
  paymentConfirmationDelayedMessage,
} from "../services/payments/paymentConfirmation";
import { quizKeys } from "../services/quizzes/quizzes.keys";
import { trackAnalyticsEvent } from "../lib/analytics-track";
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
  const releaseOrder = useReleaseCheckoutOrder();
  const verify = useVerifyPayment();
  const awaitPaidOrder = useAwaitPaidOrder();
  const paymentConfirmationRef = useRef<AbortController | null>(null);
  useEffect(() => () => paymentConfirmationRef.current?.abort(), []);

  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmationNotice, setConfirmationNotice] = useState<string | null>(
    null,
  );

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

  /** Access is in place: refresh what the page knows and hand over. */
  const finishEnrollment = async (kind: "free" | "paid", orderId: string) => {
    if (kind === "paid") {
      trackAnalyticsEvent("payment_confirmed", {
        courseId,
        orderId,
        props: { item: "quiz" },
      });
    }
    trackAnalyticsEvent("enrollment_completed", {
      courseId,
      props: { kind, item: "quiz" },
    });
    await queryClient.invalidateQueries({ queryKey: quizKeys.all });
    await pricingPreviewQuery.refetch();
    setIsProcessing(false);
    onEnrolled();
  };

  /**
   * The gateway has taken the payment but this page could not confirm it.
   * The server still marks the order paid from the gateway's webhook or its
   * recovery cycle, so the card waits for that, as the course page does,
   * and keeps the pay button out of reach meanwhile.
   */
  const confirmPaidOrder = async (orderId: string) => {
    paymentConfirmationRef.current?.abort();
    const confirmation = new AbortController();
    paymentConfirmationRef.current = confirmation;

    setErrorMessage(null);
    setConfirmationNotice(PAYMENT_BEING_CONFIRMED_MESSAGE);
    setIsProcessing(true);

    const paid = await awaitPaidOrder(orderId, confirmation.signal);
    if (confirmation.signal.aborted) return;
    paymentConfirmationRef.current = null;

    setConfirmationNotice(null);
    if (paid) {
      await finishEnrollment("paid", orderId);
      return;
    }
    setIsProcessing(false);
    setErrorMessage(paymentConfirmationDelayedMessage("quiz"));
  };

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
      trackAnalyticsEvent("checkout_start", {
        courseId,
        orderId: order.order.id,
        outcome: order.gateway ? "payment" : "free",
        props: { item: "quiz" },
      });

      // No payment step (nothing to pay), or the same purchase was already
      // paid on an earlier attempt whose confirmation did not reach this
      // page: access is granted, and reopening the gateway would only show
      // an error for an order that is complete.
      if (!order.gateway || order.order.status === "paid") {
        await finishEnrollment(order.gateway ? "paid" : "free", order.order.id);
        return;
      }

      // The order is let go and the button given back: the order is
      // cancelled on the server (unless a payment for it may still arrive),
      // so buying again is not refused while the closed window's time runs
      // out.
      const releaseThisOrder = () =>
        void releaseOrder
          .mutateAsync(order.order.id)
          .then((result) => {
            if (result.released) checkoutIntentRef.current = null;
          })
          .catch(() => undefined)
          .finally(() => setIsProcessing(false));

      // The gateway the server chose for this buyer (by their country).
      await openGatewayCheckout(
        {
          gateway: order.gateway,
          name: productName,
          description: `Quiz Access - ${quizTitle || "Assessment"}`,
          prefill: {
            name: user?.displayName || user?.username || "",
            email: user?.email || "",
          },
        },
        {
          onPaid: async (proof) => {
            try {
              await verify.mutateAsync({ orderId: order.order.id, ...proof });
              await finishEnrollment("paid", order.order.id);
            } catch {
              // The gateway has taken the payment; only our confirmation call
              // failed. This used to read "Payment verification failed.
              // Please contact support." every time (the rejection is a plain
              // object, so the `instanceof Error` test never matched), which
              // told a learner who had been charged that they had not paid.
              await confirmPaidOrder(order.order.id);
            }
          },
          onDismissed: () => {
            // A payment that went through is being confirmed; the gateway
            // closing its own window afterwards is not a cancellation.
            const confirmation = paymentConfirmationRef.current;
            if (confirmation && !confirmation.signal.aborted) return;
            trackAnalyticsEvent("payment_result", {
              courseId,
              orderId: order.order.id,
              outcome: "dismissed",
              props: { item: "quiz" },
            });
            releaseThisOrder();
          },
          // The window never came up, so nothing can have been paid in it:
          // the reason is shown.
          onBlocked: (message) => {
            trackAnalyticsEvent("payment_result", {
              courseId,
              orderId: order.order.id,
              outcome: "blocked",
              props: { item: "quiz" },
            });
            setErrorMessage(message);
            releaseThisOrder();
          },
        },
      );
    } catch (err: unknown) {
      setIsProcessing(false);
      // A refusal from the server is a plain object, not an `Error`; read
      // the same way as the course checkout so its reason is shown.
      setErrorMessage(
        readCheckoutStartError(err, "Failed to initiate quiz enrollment."),
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

        {confirmationNotice ? (
          <div className="mt-4">
            <QuizNotice tone="caution" role="status">
              {confirmationNotice}
            </QuizNotice>
          </div>
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
