import type {
  ManualTransferForClosedOrderNeedsRefund,
  ManualTransferForPaidOrderNeedsRefund,
  NeedsRefundEntry,
} from "@veolms/contracts";
import { formatCurrency, formatOrderDate } from "./orderHelpers";

/** A transfer a learner reported that staff can no longer verify. */
export type ReportedTransferEntry =
  | ManualTransferForPaidOrderNeedsRefund
  | ManualTransferForClosedOrderNeedsRefund;

/**
 * The words the Orders screen shows for one payment that staff have to
 * return by hand. Kept apart from the component, and free of React, so the
 * wording for each kind of entry can be read and replayed on its own.
 */
export interface NeedsRefundLines {
  buyerName: string;
  buyerEmail: string | null;
  /** The course, or "Bundle: ..." when a whole bundle was paid for twice. */
  courseTitle: string;
  /** What has to go back, formatted: "₹600". */
  amount: string;
  /**
   * What that amount is: "Amount"; "Order total" for a transfer; "Bundle
   * price" when it is the price of a bundle the course is inside, of which
   * staff decide how much to return.
   */
  amountLabel: string;
  /** "₹100 already refunded", when part of it has gone back. */
  refundedNote: string | null;
  /** What happened, in one sentence. */
  reason: string;
  /** What staff should do about it. */
  action: string;
  /** The order the entry opens: "#ORD-20261013-AB12CD". */
  orderNumber: string;
  /** What that order is to this entry: "Order to refund", "Order". */
  orderLabel: string;
  /**
   * What to look the money up by, when there is something: the gateway's
   * id for the payment, or the reference the buyer gave for a transfer.
   */
  reference: string | null;
  /** What that is called: "Payment ID", "Reference". */
  referenceLabel: string;
  /** "Paid Oct 13, 2026 at 5:44 AM"; "Reported ..." for a transfer. */
  when: string;
}

function withHash(orderNumber: string): string {
  return orderNumber.startsWith("#") ? orderNumber : `#${orderNumber}`;
}

function onDate(verb: string, value: string | Date): string {
  const { dateStr, timeStr } = formatOrderDate(value);
  return timeStr ? `${verb} ${dateStr} at ${timeStr}` : `${verb} ${dateStr}`;
}

/** How the buyer said they paid, as it reads inside a sentence. */
function transferName(paymentMethod: string): string {
  if (paymentMethod === "upi") return "a UPI payment";
  if (paymentMethod === "bank_transfer") return "a bank transfer";
  return "a transfer";
}

/** Whether an entry is a reported transfer: the kinds staff close by rejecting. */
export function isReportedTransfer(
  entry: NeedsRefundEntry,
): entry is ReportedTransferEntry {
  return (
    entry.kind === "manual_transfer_for_paid_order" ||
    entry.kind === "manual_transfer_for_closed_order"
  );
}

/**
 * Shown in place of the Reject button to staff who cannot use it: the notice
 * is read with billing access, but rejecting a transfer request takes
 * `payment.manual.verify`.
 */
export const ASK_ADMIN_TO_REJECT_TRANSFER =
  "Ask an admin to reject this request.";

/**
 * The note kept with a request rejected from the Orders screen, so the
 * review queue says why it was closed.
 */
export function transferRejectionNote(entry: ReportedTransferEntry): string {
  if (entry.kind === "manual_transfer_for_closed_order") {
    return entry.orderStatus === "cancelled"
      ? "Rejected from the Orders screen: the order was cancelled."
      : "Rejected from the Orders screen: the order failed.";
  }
  return "Rejected from the Orders screen: the order was paid another way.";
}

export function describeNeedsRefundEntry(
  entry: NeedsRefundEntry,
): NeedsRefundLines {
  const buyerAndCourse = {
    buyerName: entry.buyer.name,
    buyerEmail: entry.buyer.email,
    courseTitle:
      entry.kind === "duplicate_bundle_purchase"
        ? `Bundle: ${entry.bundleTitle}`
        : entry.courseTitle || "Course order",
    amount: formatCurrency(entry.amount, entry.currency),
  };

  // Money the platform never recorded: there is no payment to refund and
  // nothing has gone back that it could know of. What staff have is the
  // reference the buyer gave, and the request to close when they are done.
  if (isReportedTransfer(entry)) {
    const orderNumber = withHash(entry.order.orderNumber);
    const transfer = {
      ...buyerAndCourse,
      amountLabel: "Order total",
      refundedNote: null,
      orderNumber,
      orderLabel: "Order",
      reference: entry.transactionReference,
      referenceLabel: "Reference",
      when: onDate("Reported", entry.submittedAt),
    };
    // The order was never paid: the learner got nothing for it, and the
    // request cannot be verified any more, so it would wait for good.
    if (entry.kind === "manual_transfer_for_closed_order") {
      return {
        ...transfer,
        reason: `The learner reported ${transferName(entry.paymentMethod)} for order ${orderNumber}, and the order ${entry.orderStatus === "cancelled" ? "was then cancelled" : "then failed"}. It was never paid, so the learner got no access from it and this request can no longer be verified.`,
        action:
          "Check your bank account for this transfer. If it arrived, return it to the learner outside the platform, or ask the learner to buy again. Then reject this request.",
      };
    }
    return {
      ...transfer,
      reason: `The learner reported ${transferName(entry.paymentMethod)} for order ${orderNumber}, and the order was then paid another way. Nothing was granted for the transfer.`,
      action:
        "Check your bank account for this transfer. If it arrived, return it to the learner outside the platform. Then reject this request.",
    };
  }

  const shared = {
    ...buyerAndCourse,
    amountLabel: "Amount",
    refundedNote:
      entry.refundedAmount > 0
        ? `${formatCurrency(entry.refundedAmount, entry.currency)} already refunded`
        : null,
    reference: entry.gatewayPaymentId,
    referenceLabel: "Payment ID",
    when: onDate("Paid", entry.paidAt),
  };

  if (entry.kind === "surplus_payment") {
    const orderNumber = withHash(entry.order.orderNumber);
    return {
      ...shared,
      reason: `The gateway took this payment after order ${orderNumber} had already been paid another way. Nothing was granted for it.`,
      action:
        "Refund this payment from the gateway dashboard. Leave the order as it is.",
      orderNumber,
      orderLabel: "Order",
    };
  }

  const later = withHash(entry.order.orderNumber);
  const earlier = withHash(entry.earlierOrder.orderNumber);
  const keepsAccess = "The learner keeps access either way.";

  // The course is inside a bundle on the later order. A bundle's courses
  // are not priced one by one, so there is no amount to name: the bundle's
  // price is shown as what it is, and staff decide how much of it to return.
  if (entry.kind === "duplicate_purchase" && entry.bundleTitle !== null) {
    const first = entry.earlierOrder.bundleTitle
      ? `inside the bundle "${entry.earlierOrder.bundleTitle}" on order ${earlier}`
      : `on order ${earlier}`;
    const inBundle = {
      ...shared,
      amountLabel: "Bundle price",
      reason: `Paid for twice: ${first} first, then inside the bundle "${entry.bundleTitle}" on order ${later}. ${keepsAccess}`,
      orderNumber: later,
    };
    if (entry.gatewayProvider === "manual") {
      return {
        ...inBundle,
        action:
          "The later order was paid by manual transfer and cannot be refunded from here. One course of a bundle has no price of its own: decide how much to return, and return it outside the platform.",
        orderLabel: "Later order",
      };
    }
    return {
      ...inBundle,
      action:
        "One course of a bundle has no price of its own: decide how much to return for this course and make a partial refund of that amount on the later order. Do not refund all of it unless the whole bundle is to go back.",
      orderLabel: "Order to refund",
    };
  }

  const what =
    entry.kind === "duplicate_bundle_purchase" ? "Bundle paid" : "Paid";
  // Set when the earlier order holds the course inside a bundle.
  const earlierBundle =
    entry.kind === "duplicate_purchase" ? entry.earlierOrder.bundleTitle : null;
  const firstOrder = earlierBundle
    ? `inside the bundle "${earlierBundle}" on order ${earlier}`
    : `order ${earlier}`;
  const reason = `${what} for twice: ${firstOrder} first, then order ${later}. ${keepsAccess}`;

  // A manual transfer cannot be sent back from this screen, so the usual
  // advice would lead to a refusal. Refunding the earlier order instead is
  // only the same thing when that order holds the same item, not a bundle
  // with other courses in it.
  if (entry.gatewayProvider === "manual") {
    return {
      ...shared,
      reason,
      action: earlierBundle
        ? `The later order was paid by manual transfer and cannot be refunded from here. Return ${shared.amount} to the learner outside the platform.`
        : `The later order was paid by manual transfer and cannot be refunded from here. Refund order ${earlier} instead, or return the money outside the platform.`,
      orderNumber: later,
      orderLabel: "Later order",
    };
  }

  return {
    ...shared,
    reason,
    action:
      entry.orderTotalAmount > entry.amount
        ? `Make a partial refund of ${shared.amount} on the later order. It also holds other items, so do not refund all of it.`
        : "Refund the later order.",
    orderNumber: later,
    orderLabel: "Order to refund",
  };
}

/** The notice's heading: how many there are, in plain words. */
export function needsRefundHeadline(count: number, hasMore: boolean): string {
  if (hasMore) return `More than ${count} payments need a manual refund`;
  return count === 1
    ? "1 payment needs a manual refund"
    : `${count} payments need a manual refund`;
}
