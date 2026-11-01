/**
 * Refunds staff made outside the platform.
 *
 * An order paid by manual bank or UPI transfer has no gateway payment to
 * refund, so staff send the money back themselves and then record it. Nothing
 * here moves money: the record is what marks the order refunded, issues the
 * credit note, tells the buyer and applies the access rule.
 */

/** What the refund id of a recorded outside refund starts with. */
export const OUTSIDE_REFUND_ID_PREFIX = "manual_refund_";

/**
 * The refund id an outside refund is recorded under, or nothing when the
 * reference is blank. One reference stands for one transfer back, so it is
 * compared without regard to spacing or letter case, exactly as the
 * reference of a manual payment is (`manual_pay_...`); the column is unique,
 * which is what stops one return from being recorded twice.
 */
export function outsideRefundId(reference: string): string | null {
  const normalised = reference.replace(/\s+/gu, "").toUpperCase();
  return normalised ? `${OUTSIDE_REFUND_ID_PREFIX}${normalised}` : null;
}

/** Whether a payment from this provider arrived by manual bank or UPI transfer. */
export function isManualTransferProvider(gatewayProvider: string): boolean {
  return gatewayProvider === "manual";
}

/**
 * Why a refund may not go the way it was asked for, or nothing when it may.
 *
 * An outside refund is recorded only for a payment that arrived by manual
 * transfer, and only when the request says so in as many words: a gateway
 * payment is refunded through the gateway, and a manual one is never
 * recorded as returned by accident.
 */
export function refundChannelRefusal(
  gatewayProvider: string,
  recordedAsOutside: boolean,
): string | null {
  const paidByManualTransfer = isManualTransferProvider(gatewayProvider);
  if (paidByManualTransfer && !recordedAsOutside) {
    return "This order was paid by manual transfer, so it cannot be refunded from here. Return the money outside the platform.";
  }
  if (!paidByManualTransfer && recordedAsOutside) {
    return "This order was not paid by manual transfer, so a refund made outside the platform cannot be recorded for it. Refund it through the payment gateway instead.";
  }
  return null;
}
