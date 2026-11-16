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
  useCreateCheckoutOrder,
  useReleaseCheckoutOrder,
  useVerifyPayment,
} from "../services/payments/payment.mutations";
import { workshopPublicKeys } from "../services/workshops/workshops.keys";
import { formatWorkshopPrice } from "./workshopHelpers";

/**
 * Pay for a workshop seat: the same checkout as a quiz pass. The order is
 * created on the server, the gateway's window opens, and once the payment
 * is confirmed the registration appears (fulfilment writes it). Paid, or
 * taken and still being confirmed, the buyer goes to the order page
 * (`onPaid`), which waits for the confirmation by itself.
 */
export function WorkshopPayButton({
  workshop,
  onPaid,
}: {
  workshop: WorkshopPublic;
  onPaid: (orderId: string) => void;
}) {
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const createOrder = useCreateCheckoutOrder();
  const releaseOrder = useReleaseCheckoutOrder();
  const verify = useVerifyPayment();
  const checkoutIntentRef = useRef<{ intent: string; key: string } | null>(
    null,
  );
  const paymentConfirmationRef = useRef<AbortController | null>(null);
  // An order handed to the order page as paid or being confirmed: the
  // gateway reporting its window closed afterwards must not release it,
  // even once this page has gone.
  const handedOffOrderRef = useRef<string | null>(null);
  useEffect(() => () => paymentConfirmationRef.current?.abort(), []);

  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const finish = async (orderId: string) => {
    trackAnalyticsEvent("payment_confirmed", {
      orderId,
      props: { item: "workshop" },
    });
    await queryClient.invalidateQueries({ queryKey: workshopPublicKeys.all });
    setIsProcessing(false);
    onPaid(orderId);
  };

  /**
   * The gateway took the payment but this page could not confirm it: the
   * order page shows it being confirmed and turns to paid by itself.
   */
  const confirmPaidOrder = (orderId: string) => {
    paymentConfirmationRef.current?.abort();
    paymentConfirmationRef.current = null;
    handedOffOrderRef.current = orderId;
    setErrorMessage(null);
    setIsProcessing(false);
    onPaid(orderId);
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
              confirmPaidOrder(order.order.id);
            }
          },
          onDismissed: () => {
            if (handedOffOrderRef.current === order.order.id) return;
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
      {errorMessage ? (
        <p className="text-[13px] leading-5 text-rose-500" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
