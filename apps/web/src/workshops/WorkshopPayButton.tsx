import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { WorkshopPublic } from "@veolms/contracts";
import { Button } from "../components/Button";
import { trackAnalyticsEvent } from "../lib/analytics-track";
import { getSiteName } from "../site/siteName";
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
import { workshopPublicKeys } from "../services/workshops/workshops.keys";
import { formatWorkshopPrice } from "./workshopHelpers";

/**
 * Pay for a workshop seat: the same checkout as a quiz pass. The order is
 * created on the server, the gateway's window opens, and once the payment
 * is confirmed the registration appears (fulfilment writes it).
 */
export function WorkshopPayButton({
  workshop,
  onRegistered,
}: {
  workshop: WorkshopPublic;
  onRegistered: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const createOrder = useCreateCheckoutOrder();
  const releaseOrder = useReleaseCheckoutOrder();
  const verify = useVerifyPayment();
  const awaitPaidOrder = useAwaitPaidOrder();
  const checkoutIntentRef = useRef<{ intent: string; key: string } | null>(
    null,
  );
  const paymentConfirmationRef = useRef<AbortController | null>(null);
  useEffect(() => () => paymentConfirmationRef.current?.abort(), []);

  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const finish = async (orderId: string) => {
    trackAnalyticsEvent("payment_confirmed", {
      orderId,
      props: { item: "workshop" },
    });
    await queryClient.invalidateQueries({ queryKey: workshopPublicKeys.all });
    setIsProcessing(false);
    onRegistered();
  };

  /** The gateway took the payment but this page could not confirm it. */
  const confirmPaidOrder = async (orderId: string) => {
    paymentConfirmationRef.current?.abort();
    const confirmation = new AbortController();
    paymentConfirmationRef.current = confirmation;
    setErrorMessage(null);
    setNotice(PAYMENT_BEING_CONFIRMED_MESSAGE);
    setIsProcessing(true);
    const paid = await awaitPaidOrder(orderId, confirmation.signal);
    if (confirmation.signal.aborted) return;
    paymentConfirmationRef.current = null;
    setNotice(null);
    if (paid) {
      await finish(orderId);
      return;
    }
    setIsProcessing(false);
    setErrorMessage(paymentConfirmationDelayedMessage("workshop"));
  };

  const pay = async () => {
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      // One key per purchase, not per click: a retry reaches the same order.
      if (checkoutIntentRef.current?.intent !== workshop.id) {
        checkoutIntentRef.current = {
          intent: workshop.id,
          key: crypto.randomUUID(),
        };
      }
      const order = await createOrder.mutateAsync({
        items: [{ itemType: "workshop", workshopId: workshop.id }],
        idempotencyKey: checkoutIntentRef.current.key,
      });
      trackAnalyticsEvent("checkout_start", {
        orderId: order.order.id,
        outcome: order.gateway ? "payment" : "free",
        props: { item: "workshop" },
      });
      if (!order.gateway || order.order.status === "paid") {
        await finish(order.order.id);
        return;
      }
      const releaseThisOrder = () =>
        void releaseOrder
          .mutateAsync(order.order.id)
          .then((result) => {
            if (result.released) checkoutIntentRef.current = null;
          })
          .catch(() => undefined)
          .finally(() => setIsProcessing(false));

      await openGatewayCheckout(
        {
          gateway: order.gateway,
          name: getSiteName(),
          description: `Workshop - ${workshop.title}`,
          prefill: {
            name: user?.displayName || user?.username || "",
            email: user?.email || "",
          },
        },
        {
          onPaid: async (proof) => {
            try {
              await verify.mutateAsync({ orderId: order.order.id, ...proof });
              await finish(order.order.id);
            } catch {
              await confirmPaidOrder(order.order.id);
            }
          },
          onDismissed: () => {
            const confirmation = paymentConfirmationRef.current;
            if (confirmation && !confirmation.signal.aborted) return;
            trackAnalyticsEvent("payment_result", {
              orderId: order.order.id,
              outcome: "dismissed",
              props: { item: "workshop" },
            });
            releaseThisOrder();
          },
          onBlocked: (message) => {
            trackAnalyticsEvent("payment_result", {
              orderId: order.order.id,
              outcome: "blocked",
              props: { item: "workshop" },
            });
            setErrorMessage(message);
            releaseThisOrder();
          },
        },
      );
    } catch (error: unknown) {
      setIsProcessing(false);
      setErrorMessage(
        readCheckoutStartError(error, "The payment could not be started."),
      );
    }
  };

  return (
    <div className="grid gap-3">
      <p className="text-sm font-semibold text-(--text)">
        {formatWorkshopPrice(workshop.priceMinor, workshop.currency)}
      </p>
      <Button
        onClick={() => void pay()}
        disabled={isProcessing}
        className="w-full"
      >
        {isProcessing ? "Processing..." : "Pay and get a seat"}
      </Button>
      <p className="text-[13px] leading-5 text-(--muted)">
        You get an invoice and the usual refund window. The calendar invitation,
        reminders and the Join button follow once you have paid.
      </p>
      {notice ? (
        <p className="text-[13px] leading-5 text-(--text)" role="status">
          {notice}
        </p>
      ) : null}
      {errorMessage ? (
        <p className="text-[13px] leading-5 text-rose-500" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
