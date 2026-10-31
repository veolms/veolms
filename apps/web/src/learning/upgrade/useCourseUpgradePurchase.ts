import { useEffect, useRef, useState } from "react";
import { productName } from "../../routing/routeDescriptors";
import { useCurrentUser } from "../../services/auth";
import {
  openGatewayCheckout,
  readCheckoutStartError,
  useAwaitPaidOrder,
  useCreateCheckoutOrder,
  useReleaseCheckoutOrder,
  useVerifyPayment,
  type StopGatewayCheckout,
} from "../../services/payments";

/**
 * Buys the whole of a course the learner holds part of, from the upgrade
 * pop-up. The order names only the course: the server prices it, taking off
 * what the learner paid for the part (see `upgradeCredit`). The payment
 * window and its endings are handled as on the course page: a window closed
 * without paying lets the order go, and a payment whose confirmation is late
 * is waited for rather than asked for again.
 */
export function useCourseUpgradePurchase({
  courseId,
  courseTitle,
  onUnlocked,
}: {
  courseId: string;
  courseTitle: string;
  /** The whole course is the learner's: everything it learned is refreshed. */
  onUnlocked: () => void;
}) {
  const currentUser = useCurrentUser();
  const createOrder = useCreateCheckoutOrder();
  const releaseOrder = useReleaseCheckoutOrder();
  const verify = useVerifyPayment();
  const awaitPaidOrder = useAwaitPaidOrder();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [needsPhone, setNeedsPhone] = useState(false);
  // The gateway's own payment window is on screen.
  const [gatewayOpen, setGatewayOpen] = useState(false);
  // One key for this purchase, so a second press reaches the same order.
  const idempotencyKeyRef = useRef<string | null>(null);
  const stopGatewayRef = useRef<StopGatewayCheckout | null>(null);
  const confirmationRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      stopGatewayRef.current?.();
      confirmationRef.current?.abort();
    },
    [],
  );

  /** Waits for an order the gateway charged to be marked paid. */
  async function waitUntilPaid(orderId: string, message: string | null) {
    confirmationRef.current?.abort();
    const confirmation = new AbortController();
    confirmationRef.current = confirmation;
    setBusy(message === null);
    if (message) {
      setError(message);
    } else {
      setNotice(
        "Payment received. Unlocking the course, this can take a minute. Please do not pay again.",
      );
    }
    const paid = await awaitPaidOrder(orderId, confirmation.signal);
    if (confirmation.signal.aborted) return;
    confirmationRef.current = null;
    setBusy(false);
    setNotice(null);
    if (paid) {
      setError(null);
      onUnlocked();
    } else if (!message) {
      setError(
        "Your payment was received, but confirming it is taking longer than usual. The course unlocks by itself; check Purchase History in a few minutes. Please do not pay again.",
      );
    }
  }

  async function pay() {
    setBusy(true);
    setError(null);
    setNeedsPhone(false);
    try {
      idempotencyKeyRef.current ??= crypto.randomUUID();
      const order = await createOrder.mutateAsync({
        items: [{ itemType: "course", courseId }],
        idempotencyKey: idempotencyKeyRef.current,
      });
      // Nothing left to pay: the order is complete and the course is open.
      if (!order.gateway) {
        setBusy(false);
        onUnlocked();
        return;
      }
      if (order.order.status === "paid") {
        await waitUntilPaid(order.order.id, null);
        return;
      }

      const releaseThisOrder = () =>
        void releaseOrder
          .mutateAsync(order.order.id)
          .then((result) => {
            if (result.released) idempotencyKeyRef.current = null;
          })
          .catch(() => undefined)
          .finally(() => setBusy(false));

      const user = currentUser.data;
      stopGatewayRef.current?.();
      setGatewayOpen(true);
      stopGatewayRef.current = await openGatewayCheckout(
        {
          gateway: order.gateway,
          name: productName,
          description: courseTitle,
          prefill: {
            name: user?.displayName || user?.username,
            email: user?.email,
          },
        },
        {
          onPaid: async (proof) => {
            setGatewayOpen(false);
            try {
              await verify.mutateAsync({ orderId: order.order.id, ...proof });
              setBusy(false);
              onUnlocked();
            } catch {
              // Only our confirmation failed; the server still fulfils the
              // order from the gateway's webhook or its recovery cycle.
              await waitUntilPaid(order.order.id, null);
            }
          },
          onDismissed: () => {
            setGatewayOpen(false);
            const confirmation = confirmationRef.current;
            if (confirmation && !confirmation.signal.aborted) return;
            setError(
              "The payment window was closed before the payment was completed. You can try again whenever you are ready.",
            );
            releaseThisOrder();
          },
          onBlocked: (message) => {
            setGatewayOpen(false);
            setError(message);
            releaseThisOrder();
          },
          onClosedUnanswered: () => {
            setGatewayOpen(false);
            void waitUntilPaid(
              order.order.id,
              "The payment window closed before we heard back from it. If your payment went through, the course unlocks by itself within a few minutes, so please check Purchase History before paying again.",
            );
          },
        },
      );
    } catch (failure) {
      setBusy(false);
      setGatewayOpen(false);
      if (
        (failure as { code?: string } | null)?.code ===
        "PHONE_VERIFICATION_REQUIRED"
      ) {
        setNeedsPhone(true);
        return;
      }
      setError(
        readCheckoutStartError(
          failure,
          "Checkout could not be started. Please retry.",
        ),
      );
    }
  }

  return {
    pay,
    busy,
    gatewayOpen,
    error,
    notice,
    needsPhone,
    closePhoneCheck: () => setNeedsPhone(false),
    savedPhoneNo:
      currentUser.data && !currentUser.data.mobileVerified
        ? currentUser.data.phoneNo
        : null,
  };
}
