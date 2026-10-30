import type {
  DuplicateBundlePurchaseNeedsRefund,
  DuplicatePurchaseNeedsRefund,
  ManualTransferForClosedOrderNeedsRefund,
  ManualTransferForPaidOrderNeedsRefund,
  NeedsRefundBuyer,
  SurplusPaymentNeedsRefund,
} from "@veolms/contracts";
import { refundedSoFar } from "../payments/surplus-payment.ts";
import {
  CLOSED_UNPAID_ORDER_STATUSES,
  type ClosedUnpaidOrderStatus,
  type DuplicateBundlePurchaseRow,
  type DuplicatePurchaseRow,
  type StuckManualTransferRow,
  type SurplusPaymentToReturnRow,
} from "./needs-refund.repository.ts";

/**
 * Rows of the "needs a manual refund" list as the staff screen receives
 * them. Every amount leaves in MINOR units, as payments, refunds, orders and
 * order items are all stored.
 */

interface BuyerRowLike {
  display_name: string;
  username: string;
  email: string | null;
}

/** A buyer whose account row is gone still has to be shown as someone. */
export function toNeedsRefundBuyer(user?: BuyerRowLike): NeedsRefundBuyer {
  return {
    name: user?.display_name || user?.username || "Student",
    email: user?.email ?? null,
    username: user?.username ?? null,
  };
}

export function toSurplusPaymentEntry(
  row: SurplusPaymentToReturnRow,
  user?: BuyerRowLike,
): SurplusPaymentNeedsRefund {
  return {
    kind: "surplus_payment",
    id: row.id,
    buyer: toNeedsRefundBuyer(user),
    courseTitle: row.item_titles ?? "",
    order: { id: row.order_id, orderNumber: row.order_number },
    amount: row.amount,
    // Part refunds are noted on the payment row; it only leaves the list
    // (becomes `refunded`) when they cover the whole amount.
    refundedAmount: Math.min(refundedSoFar(row.error_description), row.amount),
    currency: row.currency,
    gatewayProvider: row.gateway_provider,
    gatewayPaymentId: row.gateway_payment_id,
    paidAt: row.paid_at,
  };
}

export function toDuplicatePurchaseEntry(
  row: DuplicatePurchaseRow,
  user?: BuyerRowLike,
): DuplicatePurchaseNeedsRefund {
  return {
    kind: "duplicate_purchase",
    id: row.id,
    buyer: toNeedsRefundBuyer(user),
    courseTitle: row.title_snapshot,
    courseId: row.course_id,
    bundleTitle: row.bundle_title,
    order: { id: row.order_id, orderNumber: row.order_number },
    orderTotalAmount: Number(row.total_amount),
    earlierOrder: {
      id: row.earlier_order_id,
      orderNumber: row.earlier_order_number,
      amount: Number(row.earlier_final_amount),
      bundleTitle: row.earlier_bundle_title,
      paidAt: row.earlier_paid_at,
    },
    // The item's price: the course's, or the whole bundle's when the course
    // is inside one (a bundle's courses are not priced one by one).
    amount: Number(row.final_amount),
    refundedAmount: Number(row.refunded_amount),
    currency: row.currency,
    gatewayProvider: row.gateway_provider,
    gatewayPaymentId: row.gateway_payment_id,
    paidAt: row.paid_at,
  };
}

export function toDuplicateBundlePurchaseEntry(
  row: DuplicateBundlePurchaseRow,
  user?: BuyerRowLike,
): DuplicateBundlePurchaseNeedsRefund {
  return {
    kind: "duplicate_bundle_purchase",
    id: row.id,
    buyer: toNeedsRefundBuyer(user),
    bundleTitle: row.title_snapshot,
    bundleId: row.bundle_id,
    order: { id: row.order_id, orderNumber: row.order_number },
    orderTotalAmount: Number(row.total_amount),
    earlierOrder: {
      id: row.earlier_order_id,
      orderNumber: row.earlier_order_number,
      amount: Number(row.earlier_final_amount),
      paidAt: row.earlier_paid_at,
    },
    amount: Number(row.final_amount),
    refundedAmount: Number(row.refunded_amount),
    currency: row.currency,
    gatewayProvider: row.gateway_provider,
    gatewayPaymentId: row.gateway_payment_id,
    paidAt: row.paid_at,
  };
}

function isClosedUnpaid(status: string): status is ClosedUnpaidOrderStatus {
  return (CLOSED_UNPAID_ORDER_STATUSES as readonly string[]).includes(status);
}

/**
 * A reported transfer that can no longer be verified, as the kind that says
 * why: its order was paid another way, or was closed without being paid.
 */
export function toStuckManualTransferEntry(
  row: StuckManualTransferRow,
  user?: BuyerRowLike,
):
  | ManualTransferForPaidOrderNeedsRefund
  | ManualTransferForClosedOrderNeedsRefund {
  const shared = {
    id: row.id,
    buyer: toNeedsRefundBuyer(user),
    courseTitle: row.item_titles ?? "",
    order: { id: row.order_id, orderNumber: row.order_number },
    // A request carries no amount: the buyer was paying for the order.
    amount: Number(row.total_amount),
    currency: row.currency,
    paymentMethod: row.payment_method,
    transactionReference: row.transaction_reference,
    submittedAt: row.submitted_at,
  };
  if (isClosedUnpaid(row.order_status)) {
    return {
      kind: "manual_transfer_for_closed_order",
      ...shared,
      orderStatus: row.order_status,
    };
  }
  return { kind: "manual_transfer_for_paid_order", ...shared };
}

/**
 * Whether a duplicate purchase still has money to go back. It has until
 * the later order has been refunded what it charged for the course: in
 * full (a fully refunded order is not listed at all), by refunding that
 * item (not listed either), or by a part refund of at least that amount,
 * which is how the Orders screen returns one course of an order that holds
 * others. A smaller part refund leaves it listed, with what has gone back.
 */
export function isDuplicateStillOwed(
  row: Pick<
    DuplicatePurchaseRow,
    "final_amount" | "refunded_amount" | "currency"
  >,
): boolean {
  return Number(row.refunded_amount) < Number(row.final_amount);
}

/**
 * The same question for a course granted twice. When the later order holds
 * the course as a course item, the answer is isDuplicateStillOwed's. When
 * it holds it inside a bundle there is no price for that one course to
 * compare refunds with: how much to return is staff's decision, so the
 * entry is owed until they have made a refund on the order as a whole (one
 * not made against a particular item; refunding the bundle item itself, or
 * the order in full, takes the row out before it gets here).
 */
export function isCourseDuplicateStillOwed(
  row: Pick<
    DuplicatePurchaseRow,
    | "final_amount"
    | "refunded_amount"
    | "currency"
    | "bundle_title"
    | "order_level_refunded_amount"
  >,
): boolean {
  if (row.bundle_title === null) return isDuplicateStillOwed(row);
  return Number(row.order_level_refunded_amount) === 0;
}

/**
 * One entry for two orders that hold the same bundle: the courses of a
 * bundle item that is itself listed as bought twice are dropped, so the
 * same money is not listed again once per course. A course the later order
 * holds any other way (a course item, or a different bundle) stays.
 */
export function withoutCoursesOfDuplicateBundles<
  Course extends Pick<DuplicatePurchaseRow, "order_item_id">,
>(
  courses: Course[],
  bundles: Pick<DuplicateBundlePurchaseRow, "id">[],
): Course[] {
  const duplicateBundleItemIds = new Set(bundles.map((row) => row.id));
  return courses.filter(
    (row) => !duplicateBundleItemIds.has(row.order_item_id),
  );
}

/**
 * Newest first, by the same (time, id) pair the queries order and page by.
 * The time is Postgres text of fixed width and the ids are lower-case
 * UUIDs, so comparing them as strings is comparing them as Postgres does.
 */
export function compareNewestFirst(
  a: { paid_at_cursor: string; id: string },
  b: { paid_at_cursor: string; id: string },
): number {
  if (a.paid_at_cursor !== b.paid_at_cursor) {
    return a.paid_at_cursor < b.paid_at_cursor ? 1 : -1;
  }
  if (a.id === b.id) return 0;
  return a.id < b.id ? 1 : -1;
}

/**
 * A cursor's time as the queries print theirs: six fractional digits. A
 * cursor is accepted with fewer, and the two are compared as text.
 */
export function toCursorTime(value: string): string {
  const [seconds = "", fraction = ""] = value.replace(/Z$/u, "").split(".");
  return `${seconds}.${fraction.padEnd(6, "0")}Z`;
}
