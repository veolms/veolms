import type { OrderStatus, PaymentStatus } from "@veolms/database";

/**
 * A surplus payment: money the gateway captured for an order that had
 * already been paid another way. It happens when staff verify a manual
 * transfer and the buyer then also completes the gateway payment they had
 * started, because the gateway order stays payable after the local payment
 * row is closed.
 *
 * It is kept on the payment row it arrived for, and nowhere else:
 *
 *   status              `captured`, then `refunded` once the gateway reports
 *                       refunds covering the whole amount
 *   gateway_payment_id  the gateway's payment id, to refund it by
 *   error_code          SURPLUS_CAPTURE_ERROR_CODE, which is what marks it
 *   error_description   what happened, and every refund reported for it
 *
 * Nothing is granted for it and the order is left as it was. Its refunds are
 * not written to `refunds`: that table is summed per order to decide what an
 * order may still be refunded and what the academy has earned, and neither
 * figure includes this money.
 *
 * The ones still to be returned are on the staff Orders screen
 * (`GET /orders/needs-refund`, orders/needs-refund.service.ts), which reads:
 *   select * from payments
 *   where error_code = 'CAPTURED_AFTER_ORDER_PAID' and status = 'captured';
 */
export const SURPLUS_CAPTURE_ERROR_CODE = "CAPTURED_AFTER_ORDER_PAID";

/** The order states that mean "paid for already", whatever happened since. */
export function isOrderAlreadyPaid(status: OrderStatus): boolean {
  return (
    status === "paid" ||
    status === "partially_refunded" ||
    status === "refunded"
  );
}

export function describeSurplusCapture(orderNumber: string): string {
  return (
    `Captured by the gateway after order ${orderNumber} had already been paid another way. ` +
    "Nothing was granted for it. Return this money from the gateway dashboard."
  );
}

/**
 * One note per refund, exactly as applySurplusRefund writes it, so that
 * `refundedSoFar` reads back those notes and nothing else. The description
 * also holds free text (the titles of what the buyer already had, see
 * extra-payment.ts), and a looser pattern counted a title such as "Refund
 * Policy of 49900 Rupees Explained" as a refund of 49900. Titles are
 * written there without round brackets, so none can contain a whole note.
 */
const REFUND_NOTE =
  /Refund (\S+) of (\d+) [A-Za-z]{3} \(minor units\) reported by the gateway\./gu;

/**
 * How much of a surplus payment the gateway has reported as refunded, in
 * minor units: the sum of the refunds noted in its description.
 */
export function refundedSoFar(description: string | null): number {
  let total = 0;
  for (const match of (description ?? "").matchAll(REFUND_NOTE)) {
    total += Number(match[2]);
  }
  return total;
}

/**
 * What a surplus payment row becomes when the gateway reports a refund of
 * it. The same refund reported twice is counted once.
 */
export function applySurplusRefund(
  payment: { amount: number; error_description: string | null },
  refund: { gatewayRefundId: string; amount: number; currency: string },
): {
  status: Extract<PaymentStatus, "captured" | "refunded">;
  errorDescription: string;
} {
  const current = payment.error_description ?? "";
  const alreadyNoted = [...current.matchAll(REFUND_NOTE)].some(
    (note) => note[1] === refund.gatewayRefundId,
  );
  const errorDescription = alreadyNoted
    ? current
    : `${current} Refund ${refund.gatewayRefundId} of ${refund.amount} ${refund.currency} (minor units) reported by the gateway.`.trim();

  return {
    status:
      refundedSoFar(errorDescription) >= payment.amount
        ? "refunded"
        : "captured",
    errorDescription,
  };
}
