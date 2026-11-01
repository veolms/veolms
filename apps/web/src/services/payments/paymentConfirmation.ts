/**
 * What a buyer is told between the gateway taking a payment and this app
 * recording it.
 *
 * The browser's own confirmation call (`/payments/verify`) is only one of
 * three ways an order gets fulfilled; the gateway's webhook and the
 * server's recovery cycle are the others. So when that call fails after the
 * buyer has paid, the money has usually been taken and the order is about
 * to be marked paid anyway. The page waits for that (see
 * `useAwaitPaidOrder`) and says so. It never says the payment failed, and
 * it never suggests paying again.
 *
 * Kept here, free of React, so every checkout says the same thing.
 */

/** What was bought, as the sentence names it. */
export type ConfirmedPurchase = "course" | "quiz";

/** Shown while the page waits for the order to be marked paid. */
export const PAYMENT_BEING_CONFIRMED_MESSAGE =
  "Payment received. We are confirming your access — this can take a few minutes. Please do not pay again.";

/** Shown when the wait ran out before the order was marked paid. */
export function paymentConfirmationDelayedMessage(
  purchase: ConfirmedPurchase,
): string {
  return `Your payment was received, but confirming it is taking longer than usual. Your ${purchase} will unlock automatically — check Purchase History in a few minutes. Please do not pay again.`;
}
